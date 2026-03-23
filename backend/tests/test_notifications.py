"""Tests for the notification system — creation, listing, mark-read, unread count."""
import pytest
from tests.conftest import TestSession
from app.models.user import User
from app.utils.enums import UserRole, UserStatus


def _create_active_user(client, username="notif_user", role=UserRole.USER):
    """Register, activate, and return (user_id, token)."""
    client.post("/api/v1/auth/register", json={
        "username": username,
        "email": f"{username}@test.com",
        "password": "testpass",
        "full_name": f"Test {username}",
    })
    session = TestSession()
    user = session.query(User).filter(User.username == username).first()
    user.role = role
    user.status = UserStatus.ACTIVE
    session.commit()
    uid = str(user.id)
    session.close()

    res = client.post("/api/v1/auth/login", json={"username": username, "password": "testpass"})
    token = res.json()["data"]["access_token"]
    return uid, token


def test_notification_lifecycle(client, db):
    """Create notifications, list, mark read, check unread count."""
    uid, token = _create_active_user(client, "notif_admin", UserRole.SUPER_ADMIN)
    headers = {"Authorization": f"Bearer {token}"}

    # Initially no notifications
    res = client.get("/api/v1/notifications", headers=headers)
    assert res.status_code == 200
    assert res.json()["data"]["total"] == 0

    res = client.get("/api/v1/notifications/unread-count", headers=headers)
    assert res.status_code == 200
    assert res.json()["data"]["count"] == 0

    # Create notifications directly via service
    from app.services import notification_service
    notification_service.create(
        db, recipient_id=uid, title="测试通知1", content="内容1",
        notification_type="SYSTEM",
    )
    notification_service.create(
        db, recipient_id=uid, title="测试通知2", content="内容2",
        notification_type="BORROW",
    )
    db.commit()

    # List — should have 2
    res = client.get("/api/v1/notifications", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["total"] == 2

    # Unread count = 2
    res = client.get("/api/v1/notifications/unread-count", headers=headers)
    assert res.json()["data"]["count"] == 2

    # Mark first as read
    notif_id = data["items"][0]["id"]
    res = client.post(f"/api/v1/notifications/{notif_id}/read", headers=headers)
    assert res.status_code == 200

    # Unread count = 1
    res = client.get("/api/v1/notifications/unread-count", headers=headers)
    assert res.json()["data"]["count"] == 1

    # Filter unread only
    res = client.get("/api/v1/notifications?is_read=false", headers=headers)
    assert res.json()["data"]["total"] == 1

    # Mark all as read
    res = client.post("/api/v1/notifications/read-all", headers=headers)
    assert res.status_code == 200

    res = client.get("/api/v1/notifications/unread-count", headers=headers)
    assert res.json()["data"]["count"] == 0


def test_notification_isolation(client, db):
    """User A cannot mark User B's notification as read."""
    uid_a, token_a = _create_active_user(client, "user_a", UserRole.SUPER_ADMIN)
    uid_b, token_b = _create_active_user(client, "user_b", UserRole.SUPER_ADMIN)

    from app.services import notification_service
    n = notification_service.create(
        db, recipient_id=uid_b, title="B的通知", content="内容",
        notification_type="SYSTEM",
    )
    db.commit()

    # User A tries to mark User B's notification
    headers_a = {"Authorization": f"Bearer {token_a}"}
    res = client.post(f"/api/v1/notifications/{n.id}/read", headers=headers_a)
    assert res.status_code == 404

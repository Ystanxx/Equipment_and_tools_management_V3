"""Tests for the order timeline endpoint."""
from tests.conftest import TestSession
from app.models.user import User
from app.utils.enums import UserRole, UserStatus


def _make_user(client, username, role=UserRole.USER):
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


def test_timeline_requires_auth(client):
    import uuid
    res = client.get(f"/api/v1/audit-logs/order-timeline/{uuid.uuid4()}")
    assert res.status_code == 401


def test_timeline_forbidden_for_non_owner(client, db):
    """A regular user cannot view timeline for an order they don't own."""
    _, token_a = _make_user(client, "tl_user_a")
    uid_b, _ = _make_user(client, "tl_user_b")
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Use a random UUID — no matching order exists, so non-admin gets 403
    import uuid
    fake_order_id = str(uuid.uuid4())
    res = client.get(f"/api/v1/audit-logs/order-timeline/{fake_order_id}", headers=headers_a)
    assert res.status_code == 403


def test_timeline_admin_can_view_any(client, db):
    """An admin can view timeline for any order (even non-existent — returns empty)."""
    _, token = _make_user(client, "tl_admin", UserRole.SUPER_ADMIN)
    headers = {"Authorization": f"Bearer {token}"}

    import uuid
    res = client.get(f"/api/v1/audit-logs/order-timeline/{uuid.uuid4()}", headers=headers)
    assert res.status_code == 200
    assert res.json()["data"] == []

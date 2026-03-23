from app.core.security import hash_password
from app.models.user import User
from app.services import email_service, notification_service
from app.utils.enums import UserRole, UserStatus


def _create_active_user(db, client, username: str, role: UserRole = UserRole.USER):
    user = User(
        username=username,
        email=f"{username}@test.com",
        hashed_password=hash_password("testpass"),
        full_name=f"Test {username}",
        role=role,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    login_res = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": "testpass"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["data"]["access_token"]
    return user, {"Authorization": f"Bearer {token}"}


def test_update_current_user_email_preference(client, db):
    _, headers = _create_active_user(db, client, "pref_user")

    response = client.put(
        "/api/v1/auth/preferences/email",
        headers=headers,
        json={"email_notifications_enabled": False},
    )

    assert response.status_code == 200
    assert response.json()["data"]["email_notifications_enabled"] is False

    me_response = client.get("/api/v1/auth/me", headers=headers)
    assert me_response.status_code == 200
    assert me_response.json()["data"]["email_notifications_enabled"] is False


def test_email_delivery_respects_global_and_user_switch(client, db, monkeypatch):
    _, admin_headers = _create_active_user(db, client, "mail_admin", UserRole.SUPER_ADMIN)
    recipient, recipient_headers = _create_active_user(db, client, "mail_user")

    sent_messages: list[tuple[str, str, str]] = []

    def fake_send_notification_email(to_email: str, title: str, content: str):
        sent_messages.append((to_email, title, content))
        return True

    monkeypatch.setattr(email_service, "send_notification_email", fake_send_notification_email)

    enable_global = client.put(
        "/api/v1/system-configs",
        headers=admin_headers,
        json={"values": {"enable_email_notifications": True}},
    )
    assert enable_global.status_code == 200

    notification_service.create(
        db,
        recipient_id=recipient.id,
        title="全局开启时发送",
        content="内容1",
        notification_type="SYSTEM",
    )
    db.commit()
    assert sent_messages == [(recipient.email, "全局开启时发送", "内容1")]

    disable_user = client.put(
        "/api/v1/auth/preferences/email",
        headers=recipient_headers,
        json={"email_notifications_enabled": False},
    )
    assert disable_user.status_code == 200

    notification_service.create(
        db,
        recipient_id=recipient.id,
        title="用户关闭时不发送",
        content="内容2",
        notification_type="SYSTEM",
    )
    db.commit()
    assert len(sent_messages) == 1

    enable_user = client.put(
        "/api/v1/auth/preferences/email",
        headers=recipient_headers,
        json={"email_notifications_enabled": True},
    )
    assert enable_user.status_code == 200

    disable_global = client.put(
        "/api/v1/system-configs",
        headers=admin_headers,
        json={"values": {"enable_email_notifications": False}},
    )
    assert disable_global.status_code == 200

    notification_service.create(
        db,
        recipient_id=recipient.id,
        title="全局关闭时不发送",
        content="内容3",
        notification_type="SYSTEM",
    )
    db.commit()
    assert len(sent_messages) == 1

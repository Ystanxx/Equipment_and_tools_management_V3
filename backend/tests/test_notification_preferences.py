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


def test_notification_email_escapes_html(monkeypatch):
    captured = {}

    def fake_send_email(to_email: str, subject: str, body_text: str, body_html: str | None = None):
        captured["to_email"] = to_email
        captured["subject"] = subject
        captured["body_text"] = body_text
        captured["body_html"] = body_html
        return True

    monkeypatch.setattr(email_service, "send_email", fake_send_email)

    result = email_service.send_notification_email(
        "receiver@test.com",
        "<审核提醒>",
        "请处理<script>alert(1)</script>",
    )

    assert result is True
    assert captured["to_email"] == "receiver@test.com"
    assert captured["subject"] == "[器材管理] <审核提醒>"
    assert "<script>" not in captured["body_html"]
    assert "&lt;script&gt;" in captured["body_html"]


def test_borrow_delivery_sends_email_to_applicant(client, db, asset_type_ids, monkeypatch):
    _, super_headers = _create_active_user(db, client, "deliver_super", UserRole.SUPER_ADMIN)
    asset_admin, admin_headers = _create_active_user(db, client, "deliver_asset_admin", UserRole.ASSET_ADMIN)
    applicant, applicant_headers = _create_active_user(db, client, "deliver_applicant")

    sent_messages: list[tuple[str, str, str]] = []

    def fake_send_notification_email(to_email: str, title: str, content: str):
        sent_messages.append((to_email, title, content))
        return True

    monkeypatch.setattr(email_service, "send_notification_email", fake_send_notification_email)

    enable_global = client.put(
        "/api/v1/system-configs",
        headers=super_headers,
        json={"values": {"enable_email_notifications": True}},
    )
    assert enable_global.status_code == 200

    category_id = client.post(
        "/api/v1/asset-categories",
        headers=super_headers,
        json={"name": "交付通知分类"},
    ).json()["data"]["id"]
    location_id = client.post(
        "/api/v1/storage-locations",
        headers=super_headers,
        json={"name": "交付通知位置", "code": "MAIL01"},
    ).json()["data"]["id"]
    asset_id = client.post(
        "/api/v1/assets",
        headers=super_headers,
        json={
            "name": "交付通知测试设备",
            "asset_type_id": asset_type_ids["固定资产"],
            "category_id": category_id,
            "location_id": location_id,
            "admin_id": str(asset_admin.id),
        },
    ).json()["data"]["id"]

    order_response = client.post(
        "/api/v1/borrow-orders",
        headers=applicant_headers,
        json={"asset_ids": [asset_id], "purpose": "验证交付邮件通知"},
    )
    assert order_response.status_code == 200
    order_data = order_response.json()["data"]
    task_id = order_data["approval_tasks"][0]["id"]

    approve_response = client.post(
        f"/api/v1/borrow-approval-tasks/{task_id}/approve",
        headers=admin_headers,
        json={"comment": "同意"},
    )
    assert approve_response.status_code == 200

    sent_messages.clear()
    deliver_response = client.post(
        f"/api/v1/borrow-orders/{order_data['id']}/deliver",
        headers=admin_headers,
    )

    assert deliver_response.status_code == 200
    assert sent_messages == [
        (
            applicant.email,
            "借用设备已确认交付",
            f"管理员 {asset_admin.full_name} 已确认交付借用单 {order_data['order_no']}，共 1 件设备。",
        )
    ]

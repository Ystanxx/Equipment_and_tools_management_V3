from sqlalchemy import text

from app.models.system_config import SystemConfig
from app.services import email_service


def _create_category_and_location(client, auth_headers, suffix: str) -> tuple[str, str]:
    category = client.post(
        "/api/v1/asset-categories",
        headers=auth_headers,
        json={"name": f"配置测试分类{suffix}"},
    )
    location = client.post(
        "/api/v1/storage-locations",
        headers=auth_headers,
        json={"name": f"配置测试位置{suffix}", "code": f"CFG{suffix}", "building": "A", "room": suffix},
    )
    return category.json()["data"]["id"], location.json()["data"]["id"]


def _create_asset(client, auth_headers, *, category_id: str, location_id: str, admin_id: str, name: str, asset_type_id: str) -> str:
    response = client.post(
        "/api/v1/assets",
        headers=auth_headers,
        json={
            "name": name,
            "asset_type_id": asset_type_id,
            "category_id": category_id,
            "location_id": location_id,
            "admin_id": admin_id,
        },
    )
    assert response.status_code == 200
    return response.json()["data"]["id"]


def test_list_system_configs_returns_defaults(client, auth_headers):
    response = client.get("/api/v1/system-configs", headers=auth_headers)

    assert response.status_code == 200
    items = response.json()["data"]
    config_map = {item["key"]: item["value"] for item in items}
    assert config_map["borrow_order_max_items"] == 20
    assert config_map["photo_target_format"] == "JPEG"


def test_list_system_configs_includes_smtp_without_secret_plaintext(client, auth_headers):
    update = client.put(
        "/api/v1/system-configs",
        headers=auth_headers,
        json={"values": {"smtp_password": "smtp-secret-value"}},
    )
    assert update.status_code == 200
    assert "smtp-secret-value" not in update.text

    response = client.get("/api/v1/system-configs", headers=auth_headers)

    assert response.status_code == 200
    items = response.json()["data"]
    smtp_items = [item for item in items if item["group"] == "smtp"]
    assert {item["key"] for item in smtp_items} >= {
        "smtp_host",
        "smtp_port",
        "smtp_user",
        "smtp_password",
        "smtp_use_ssl",
        "smtp_from_name",
        "smtp_from_email",
        "smtp_notification_template",
    }

    password_item = next(item for item in items if item["key"] == "smtp_password")
    assert password_item["value"] == ""
    assert password_item["is_secret"] is True
    assert password_item["has_value"] is True
    assert "smtp-secret-value" not in response.text

    template_item = next(item for item in items if item["key"] == "smtp_notification_template")
    assert template_item["value_type"] == "text"
    assert "{title}" in template_item["value"]
    assert "{content}" in template_item["value"]


def test_update_smtp_password_empty_keeps_existing_value(client, auth_headers, db):
    first = client.put(
        "/api/v1/system-configs",
        headers=auth_headers,
        json={"values": {"smtp_password": "first-secret"}},
    )
    assert first.status_code == 200

    saved = db.query(SystemConfig).filter(SystemConfig.key == "smtp_password").first()
    assert saved.value == "first-secret"

    second = client.put(
        "/api/v1/system-configs",
        headers=auth_headers,
        json={"values": {"smtp_password": ""}},
    )
    assert second.status_code == 200
    db.refresh(saved)
    assert saved.value == "first-secret"
    assert "first-secret" not in second.text


def test_test_email_returns_400_when_smtp_incomplete(client, auth_headers, monkeypatch):
    monkeypatch.setattr(email_service.settings, "SMTP_HOST", "", raising=False)
    monkeypatch.setattr(email_service.settings, "SMTP_USER", "", raising=False)
    monkeypatch.setattr(email_service.settings, "SMTP_PASSWORD", "", raising=False)

    response = client.post(
        "/api/v1/system-configs/test-email",
        headers=auth_headers,
        json={"to_email": "receiver@test.com"},
    )

    assert response.status_code == 400
    assert "SMTP 配置不完整" in response.json()["detail"]


def test_test_email_success_uses_database_smtp_config(client, auth_headers, monkeypatch):
    update = client.put(
        "/api/v1/system-configs",
        headers=auth_headers,
        json={
            "values": {
                "smtp_host": "smtp.test.local",
                "smtp_port": 587,
                "smtp_user": "sender@test.com",
                "smtp_password": "smtp-secret",
                "smtp_use_ssl": False,
                "smtp_from_name": "测试系统",
                "smtp_from_email": "sender@test.com",
            }
        },
    )
    assert update.status_code == 200

    sent = {}

    def fake_send_test_email(to_email: str, *, db=None):
        sent["to_email"] = to_email
        sent["has_db"] = db is not None
        return True

    monkeypatch.setattr(email_service, "send_test_email", fake_send_test_email)

    response = client.post(
        "/api/v1/system-configs/test-email",
        headers=auth_headers,
        json={"to_email": "receiver@test.com"},
    )

    assert response.status_code == 200
    assert response.json()["message"] == "测试邮件已发送"
    assert sent == {"to_email": "receiver@test.com", "has_db": True}


def test_system_configs_drive_borrow_validation(client, auth_headers, asset_type_ids):
    update = client.put(
        "/api/v1/system-configs",
        headers=auth_headers,
        json={
            "values": {
                "borrow_order_max_items": 1,
                "require_borrow_purpose": True,
                "require_expected_return_time": True,
            }
        },
    )
    assert update.status_code == 200

    me = client.get("/api/v1/auth/me", headers=auth_headers).json()["data"]
    category_id, location_id = _create_category_and_location(client, auth_headers, "001")
    first_asset_id = _create_asset(
        client,
        auth_headers,
        category_id=category_id,
        location_id=location_id,
        admin_id=me["id"],
        name="配置校验设备一",
        asset_type_id=asset_type_ids["固定资产"],
    )
    second_asset_id = _create_asset(
        client,
        auth_headers,
        category_id=category_id,
        location_id=location_id,
        admin_id=me["id"],
        name="配置校验设备二",
        asset_type_id=asset_type_ids["固定资产"],
    )

    missing_required_fields = client.post(
        "/api/v1/borrow-orders",
        headers=auth_headers,
        json={"asset_ids": [first_asset_id]},
    )
    assert missing_required_fields.status_code == 400
    assert "借用用途" in missing_required_fields.json()["detail"]

    too_many_items = client.post(
        "/api/v1/borrow-orders",
        headers=auth_headers,
        json={
            "asset_ids": [first_asset_id, second_asset_id],
            "purpose": "配置校验",
            "expected_return_date": "2026-03-31",
        },
    )
    assert too_many_items.status_code == 400
    assert "最多借出 1 件" in too_many_items.json()["detail"]

    success = client.post(
        "/api/v1/borrow-orders",
        headers=auth_headers,
        json={
            "asset_ids": [first_asset_id],
            "purpose": "配置校验通过",
            "expected_return_date": "2026-03-31",
        },
    )
    assert success.status_code == 200
    assert success.json()["data"]["item_count"] == 1


def test_list_system_configs_falls_back_to_defaults_when_table_missing(client, auth_headers, db):
    bind = db.get_bind()
    db.execute(text("DROP TABLE IF EXISTS system_configs"))
    db.commit()

    try:
        response = client.get("/api/v1/system-configs", headers=auth_headers)

        assert response.status_code == 200
        config_map = {item["key"]: item["value"] for item in response.json()["data"]}
        assert config_map["borrow_order_max_items"] == 20
        assert config_map["require_borrow_purpose"] is False
    finally:
        SystemConfig.__table__.create(bind=bind, checkfirst=True)


def test_update_system_configs_returns_clear_message_when_table_missing(client, auth_headers, db):
    bind = db.get_bind()
    db.execute(text("DROP TABLE IF EXISTS system_configs"))
    db.commit()

    try:
        response = client.put(
            "/api/v1/system-configs",
            headers=auth_headers,
            json={"values": {"borrow_order_max_items": 5}},
        )

        assert response.status_code == 503
        assert "alembic upgrade head" in response.json()["detail"]
    finally:
        SystemConfig.__table__.create(bind=bind, checkfirst=True)

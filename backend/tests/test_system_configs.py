from sqlalchemy import text

from app.models.system_config import SystemConfig


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

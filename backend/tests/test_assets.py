from io import BytesIO

from PIL import Image


def test_create_asset(client, auth_headers, asset_type_ids):
    res = client.post("/api/v1/assets", json={
        "name": "数字示波器",
        "asset_type_id": asset_type_ids["固定资产"],
        "admin_id": _get_admin_id(client, auth_headers),
    }, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["asset_code"].startswith("SZ")
    assert data["name"] == "数字示波器"
    assert data["status"] == "IN_STOCK"


def test_list_assets(client, auth_headers, asset_type_ids):
    admin_id = _get_admin_id(client, auth_headers)
    client.post("/api/v1/assets", json={"name": "万用表", "asset_type_id": asset_type_ids["非固定资产"], "admin_id": admin_id}, headers=auth_headers)
    client.post("/api/v1/assets", json={"name": "万用表", "asset_type_id": asset_type_ids["非固定资产"], "admin_id": admin_id}, headers=auth_headers)

    res = client.get("/api/v1/assets", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["data"]["total"] >= 2


def test_list_assets_includes_preview_paths(client, auth_headers, asset_type_ids):
    admin_id = _get_admin_id(client, auth_headers)
    create_res = client.post(
        "/api/v1/assets",
        json={"name": "带图设备", "asset_type_id": asset_type_ids["固定资产"], "admin_id": admin_id},
        headers=auth_headers,
    )
    asset = create_res.json()["data"]

    image = Image.new("RGB", (32, 32), color=(201, 109, 59))
    payload = BytesIO()
    image.save(payload, format="PNG")
    payload.seek(0)

    upload_res = client.post(
        "/api/v1/attachments",
        headers=auth_headers,
        files={"file": ("preview.png", payload.getvalue(), "image/png")},
        data={"photo_type": "INVENTORY", "related_type": "Asset", "related_id": asset["id"]},
    )
    assert upload_res.status_code == 200

    list_res = client.get("/api/v1/assets", headers=auth_headers)
    assert list_res.status_code == 200
    preview_asset = next(item for item in list_res.json()["data"]["items"] if item["id"] == asset["id"])
    assert preview_asset["preview_file_path"]
    assert preview_asset["preview_thumb_path"]


def test_update_asset(client, auth_headers, asset_type_ids):
    admin_id = _get_admin_id(client, auth_headers)
    create_res = client.post("/api/v1/assets", json={"name": "电源", "asset_type_id": asset_type_ids["固定资产"], "admin_id": admin_id}, headers=auth_headers)
    asset_id = create_res.json()["data"]["id"]

    update_res = client.put(f"/api/v1/assets/{asset_id}", json={"brand": "Keysight"}, headers=auth_headers)
    assert update_res.status_code == 200
    assert update_res.json()["data"]["brand"] == "Keysight"


def test_update_asset_status(client, auth_headers, asset_type_ids):
    admin_id = _get_admin_id(client, auth_headers)
    create_res = client.post("/api/v1/assets", json={"name": "频谱仪", "asset_type_id": asset_type_ids["固定资产"], "admin_id": admin_id}, headers=auth_headers)
    asset_id = create_res.json()["data"]["id"]

    update_res = client.put(f"/api/v1/assets/{asset_id}", json={"status": "DAMAGED"}, headers=auth_headers)
    assert update_res.status_code == 200
    assert update_res.json()["data"]["status"] == "DAMAGED"


def test_list_assets_supports_updated_after_filter(client, auth_headers, asset_type_ids):
    admin_id = _get_admin_id(client, auth_headers)
    first_res = client.post(
        "/api/v1/assets",
        json={"name": "旧设备", "asset_type_id": asset_type_ids["固定资产"], "admin_id": admin_id},
        headers=auth_headers,
    )
    assert first_res.status_code == 200
    first_updated_at = first_res.json()["data"]["updated_at"]

    second_res = client.post(
        "/api/v1/assets",
        json={"name": "新设备", "asset_type_id": asset_type_ids["固定资产"], "admin_id": admin_id},
        headers=auth_headers,
    )
    assert second_res.status_code == 200
    second_id = second_res.json()["data"]["id"]

    list_res = client.get(
        "/api/v1/assets",
        params={"updated_after": first_updated_at, "page_size": 10},
        headers=auth_headers,
    )
    assert list_res.status_code == 200
    items = list_res.json()["data"]["items"]
    assert any(item["id"] == second_id for item in items)


def test_asset_live_state_changes_after_asset_update(client, auth_headers, asset_type_ids):
    admin_id = _get_admin_id(client, auth_headers)
    create_res = client.post(
        "/api/v1/assets",
        json={"name": "同步设备", "asset_type_id": asset_type_ids["固定资产"], "admin_id": admin_id},
        headers=auth_headers,
    )
    assert create_res.status_code == 200
    asset_id = create_res.json()["data"]["id"]

    first_state_res = client.get("/api/v1/assets/live-state", headers=auth_headers)
    assert first_state_res.status_code == 200
    first_version = first_state_res.json()["data"]["asset_version"]

    update_res = client.put(
        f"/api/v1/assets/{asset_id}",
        json={"brand": "Inventory Sync Brand"},
        headers=auth_headers,
    )
    assert update_res.status_code == 200

    second_state_res = client.get("/api/v1/assets/live-state", headers=auth_headers)
    assert second_state_res.status_code == 200
    second_payload = second_state_res.json()["data"]
    assert second_payload["asset_version"]
    assert second_payload["updated_asset_count"] >= 1
    assert second_payload["asset_version"] != first_version


def test_asset_display_status_shows_ready_for_pickup_after_all_approvals(client, auth_headers, asset_type_ids):
    admin_id = _get_admin_id(client, auth_headers)
    create_res = client.post(
        "/api/v1/assets",
        json={"name": "待领取设备", "asset_type_id": asset_type_ids["固定资产"], "admin_id": admin_id},
        headers=auth_headers,
    )
    assert create_res.status_code == 200
    asset_id = create_res.json()["data"]["id"]

    order_res = client.post(
        "/api/v1/borrow-orders",
        json={"asset_ids": [asset_id], "purpose": "显示状态测试"},
        headers=auth_headers,
    )
    assert order_res.status_code == 200
    task_id = order_res.json()["data"]["approval_tasks"][0]["id"]

    approve_res = client.post(
        f"/api/v1/borrow-approval-tasks/{task_id}/approve",
        json={"comment": "审批通过"},
        headers=auth_headers,
    )
    assert approve_res.status_code == 200

    list_res = client.get("/api/v1/assets", headers=auth_headers)
    assert list_res.status_code == 200
    asset = next(item for item in list_res.json()["data"]["items"] if item["id"] == asset_id)
    assert asset["status"] == "PENDING_BORROW_APPROVAL"
    assert asset["display_status"] == "READY_FOR_PICKUP"

    detail_res = client.get(f"/api/v1/assets/{asset_id}", headers=auth_headers)
    assert detail_res.status_code == 200
    assert detail_res.json()["data"]["display_status"] == "READY_FOR_PICKUP"


def test_list_assets_includes_current_borrower_name(client, auth_headers, asset_type_ids):
    me_res = client.get("/api/v1/auth/me", headers=auth_headers)
    assert me_res.status_code == 200
    current_user = me_res.json()["data"]

    create_res = client.post(
        "/api/v1/assets",
        json={
            "name": "借出人展示设备",
            "asset_type_id": asset_type_ids["固定资产"],
            "admin_id": current_user["id"],
        },
        headers=auth_headers,
    )
    assert create_res.status_code == 200
    asset_id = create_res.json()["data"]["id"]

    order_res = client.post(
        "/api/v1/borrow-orders",
        json={"asset_ids": [asset_id], "purpose": "借出人展示测试"},
        headers=auth_headers,
    )
    assert order_res.status_code == 200

    list_res = client.get(
        "/api/v1/assets",
        params={"admin_id": current_user["id"]},
        headers=auth_headers,
    )
    assert list_res.status_code == 200
    asset = next(item for item in list_res.json()["data"]["items"] if item["id"] == asset_id)
    assert asset["borrower_name"] == current_user["full_name"]


def _get_admin_id(client, headers):
    me = client.get("/api/v1/auth/me", headers=headers)
    return me.json()["data"]["id"]

def test_create_asset(client, auth_headers):
    res = client.post("/api/v1/assets", json={
        "name": "数字示波器",
        "asset_type": "DEVICE",
        "admin_id": _get_admin_id(client, auth_headers),
    }, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["asset_code"].startswith("SZ")
    assert data["name"] == "数字示波器"
    assert data["status"] == "IN_STOCK"


def test_list_assets(client, auth_headers):
    admin_id = _get_admin_id(client, auth_headers)
    client.post("/api/v1/assets", json={"name": "万用表", "asset_type": "TOOL", "admin_id": admin_id}, headers=auth_headers)
    client.post("/api/v1/assets", json={"name": "万用表", "asset_type": "TOOL", "admin_id": admin_id}, headers=auth_headers)

    res = client.get("/api/v1/assets", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["data"]["total"] >= 2


def test_update_asset(client, auth_headers):
    admin_id = _get_admin_id(client, auth_headers)
    create_res = client.post("/api/v1/assets", json={"name": "电源", "asset_type": "DEVICE", "admin_id": admin_id}, headers=auth_headers)
    asset_id = create_res.json()["data"]["id"]

    update_res = client.put(f"/api/v1/assets/{asset_id}", json={"brand": "Keysight"}, headers=auth_headers)
    assert update_res.status_code == 200
    assert update_res.json()["data"]["brand"] == "Keysight"


def _get_admin_id(client, headers):
    me = client.get("/api/v1/auth/me", headers=headers)
    return me.json()["data"]["id"]

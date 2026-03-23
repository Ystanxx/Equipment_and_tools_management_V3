from app.models.user import User
from app.utils.enums import UserRole, UserStatus


def _login_as_role(client, db, username: str, role: UserRole):
    password = "testpass123"
    client.post("/api/v1/auth/register", json={
        "username": username,
        "email": f"{username}@test.com",
        "password": password,
        "full_name": username,
    })
    user = db.query(User).filter(User.username == username).first()
    user.role = role
    user.status = UserStatus.ACTIVE
    db.commit()

    res = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    token = res.json()["data"]["access_token"]
    return user, {"Authorization": f"Bearer {token}"}


def test_asset_admin_can_list_but_cannot_manage_categories_and_locations(client, db):
    _, super_headers = _login_as_role(client, db, "scope_super", UserRole.SUPER_ADMIN)
    asset_admin, admin_headers = _login_as_role(client, db, "scope_asset_admin", UserRole.ASSET_ADMIN)

    create_category_res = client.post(
        "/api/v1/asset-categories",
        json={"name": "示波器", "description": "测试分类"},
        headers=super_headers,
    )
    assert create_category_res.status_code == 200
    category_id = create_category_res.json()["data"]["id"]

    create_location_res = client.post(
        "/api/v1/storage-locations",
        json={"name": "A楼301", "building": "A楼", "room": "301"},
        headers=super_headers,
    )
    assert create_location_res.status_code == 200
    location_id = create_location_res.json()["data"]["id"]

    list_category_res = client.get("/api/v1/asset-categories", headers=admin_headers)
    assert list_category_res.status_code == 200
    assert len(list_category_res.json()["data"]) == 1

    list_location_res = client.get("/api/v1/storage-locations", headers=admin_headers)
    assert list_location_res.status_code == 200
    assert len(list_location_res.json()["data"]) == 1

    for method, path, payload in [
        ("post", "/api/v1/asset-categories", {"name": "新分类"}),
        ("put", f"/api/v1/asset-categories/{category_id}", {"description": "修改说明"}),
        ("delete", f"/api/v1/asset-categories/{category_id}", None),
        ("post", "/api/v1/storage-locations", {"name": "B楼201"}),
        ("put", f"/api/v1/storage-locations/{location_id}", {"remark": "修改备注"}),
        ("delete", f"/api/v1/storage-locations/{location_id}", None),
    ]:
        if method == "delete":
            response = client.delete(path, headers=admin_headers)
        else:
            response = getattr(client, method)(path, headers=admin_headers, json=payload)
        assert response.status_code == 403
        assert response.json()["detail"] == "权限不足"

    create_asset_res = client.post("/api/v1/assets", json={
        "name": "资产管理员设备",
        "asset_type": "DEVICE",
        "admin_id": str(asset_admin.id),
    }, headers=super_headers)
    assert create_asset_res.status_code == 200
    asset_id = create_asset_res.json()["data"]["id"]

    update_asset_res = client.put(f"/api/v1/assets/{asset_id}", json={
        "category_id": category_id,
        "location_id": location_id,
    }, headers=admin_headers)
    assert update_asset_res.status_code == 200
    assert update_asset_res.json()["data"]["category_id"] == category_id
    assert update_asset_res.json()["data"]["location_id"] == location_id

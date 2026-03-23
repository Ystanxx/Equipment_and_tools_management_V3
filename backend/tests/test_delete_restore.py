from app.models.asset import Asset
from app.models.asset_category import AssetCategory
from app.models.storage_location import StorageLocation
from app.models.user import User
from app.utils.enums import UserRole, UserStatus


def _login_as_role(client, db, username: str, role: UserRole):
    password = "testpass123"
    client.post(
        "/api/v1/auth/register",
        json={
            "username": username,
            "email": f"{username}@test.com",
            "password": password,
            "full_name": username,
        },
    )
    user = db.query(User).filter(User.username == username).first()
    user.role = role
    user.status = UserStatus.ACTIVE
    db.commit()

    res = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    token = res.json()["data"]["access_token"]
    return user, {"Authorization": f"Bearer {token}"}


def _create_asset(client, headers, name: str, admin_id: str, category_id: str | None = None, location_id: str | None = None):
    payload = {
        "name": name,
        "asset_type": "DEVICE",
        "admin_id": admin_id,
    }
    if category_id:
        payload["category_id"] = category_id
    if location_id:
        payload["location_id"] = location_id
    response = client.post("/api/v1/assets", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["data"]["id"]


def test_super_admin_can_delete_unused_category_and_location(client, db):
    _, super_headers = _login_as_role(client, db, "delete_super", UserRole.SUPER_ADMIN)

    category_res = client.post(
        "/api/v1/asset-categories",
        json={"name": "待删分类", "description": "未被引用"},
        headers=super_headers,
    )
    location_res = client.post(
        "/api/v1/storage-locations",
        json={"name": "待删位置", "building": "A楼", "room": "101"},
        headers=super_headers,
    )
    category_id = category_res.json()["data"]["id"]
    location_id = location_res.json()["data"]["id"]

    delete_category_res = client.delete(f"/api/v1/asset-categories/{category_id}", headers=super_headers)
    delete_location_res = client.delete(f"/api/v1/storage-locations/{location_id}", headers=super_headers)

    assert delete_category_res.status_code == 200
    assert delete_location_res.status_code == 200
    assert db.query(AssetCategory).filter(AssetCategory.id == category_id).first() is None
    assert db.query(StorageLocation).filter(StorageLocation.id == location_id).first() is None


def test_super_admin_cannot_delete_used_category_or_location(client, db):
    _, super_headers = _login_as_role(client, db, "used_super", UserRole.SUPER_ADMIN)
    asset_admin, _ = _login_as_role(client, db, "used_asset_admin", UserRole.ASSET_ADMIN)

    category_res = client.post(
        "/api/v1/asset-categories",
        json={"name": "已使用分类", "description": "测试"},
        headers=super_headers,
    )
    location_res = client.post(
        "/api/v1/storage-locations",
        json={"name": "已使用位置", "building": "B楼", "room": "202"},
        headers=super_headers,
    )
    category_id = category_res.json()["data"]["id"]
    location_id = location_res.json()["data"]["id"]

    _create_asset(
        client,
        super_headers,
        "已绑定设备",
        str(asset_admin.id),
        category_id=category_id,
        location_id=location_id,
    )

    delete_category_res = client.delete(f"/api/v1/asset-categories/{category_id}", headers=super_headers)
    delete_location_res = client.delete(f"/api/v1/storage-locations/{location_id}", headers=super_headers)

    assert delete_category_res.status_code == 409
    assert "无法删除" in delete_category_res.json()["detail"]
    assert delete_location_res.status_code == 409
    assert "无法删除" in delete_location_res.json()["detail"]


def test_super_admin_can_delete_and_restore_recent_asset(client, db):
    _, super_headers = _login_as_role(client, db, "restore_super", UserRole.SUPER_ADMIN)
    asset_admin, _ = _login_as_role(client, db, "restore_asset_admin", UserRole.ASSET_ADMIN)

    asset_id = _create_asset(client, super_headers, "可恢复设备", str(asset_admin.id))

    delete_res = client.delete(f"/api/v1/assets/{asset_id}", headers=super_headers)
    assert delete_res.status_code == 200
    assert delete_res.json()["data"]["is_active"] is False
    assert db.query(Asset).filter(Asset.id == asset_id).first().is_active is False

    recent_res = client.get("/api/v1/assets/deleted/recent", headers=super_headers)
    recent_ids = [item["id"] for item in recent_res.json()["data"]]
    assert asset_id in recent_ids

    restore_res = client.post(f"/api/v1/assets/{asset_id}/restore", headers=super_headers)
    assert restore_res.status_code == 200
    assert restore_res.json()["data"]["is_active"] is True
    assert db.query(Asset).filter(Asset.id == asset_id).first().is_active is True


def test_deleted_assets_no_longer_block_category_or_location_delete(client, db):
    _, super_headers = _login_as_role(client, db, "inactive_ref_super", UserRole.SUPER_ADMIN)
    asset_admin, _ = _login_as_role(client, db, "inactive_ref_admin", UserRole.ASSET_ADMIN)

    category_res = client.post(
        "/api/v1/asset-categories",
        json={"name": "删除后可清理分类"},
        headers=super_headers,
    )
    location_res = client.post(
        "/api/v1/storage-locations",
        json={"name": "删除后可清理位置"},
        headers=super_headers,
    )
    category_id = category_res.json()["data"]["id"]
    location_id = location_res.json()["data"]["id"]

    asset_id = _create_asset(
        client,
        super_headers,
        "引用后删除设备",
        str(asset_admin.id),
        category_id=category_id,
        location_id=location_id,
    )

    delete_asset_res = client.delete(f"/api/v1/assets/{asset_id}", headers=super_headers)
    assert delete_asset_res.status_code == 200
    assert delete_asset_res.json()["data"]["is_active"] is False

    delete_category_res = client.delete(f"/api/v1/asset-categories/{category_id}", headers=super_headers)
    delete_location_res = client.delete(f"/api/v1/storage-locations/{location_id}", headers=super_headers)

    assert delete_category_res.status_code == 200
    assert delete_location_res.status_code == 200


def test_only_latest_five_deleted_assets_can_be_restored(client, db):
    _, super_headers = _login_as_role(client, db, "recent_super", UserRole.SUPER_ADMIN)
    asset_admin, _ = _login_as_role(client, db, "recent_asset_admin", UserRole.ASSET_ADMIN)

    asset_ids = []
    for index in range(6):
        asset_ids.append(_create_asset(client, super_headers, f"设备{index + 1}", str(asset_admin.id)))

    for asset_id in asset_ids:
        delete_res = client.delete(f"/api/v1/assets/{asset_id}", headers=super_headers)
        assert delete_res.status_code == 200

    recent_res = client.get("/api/v1/assets/deleted/recent", headers=super_headers)
    assert recent_res.status_code == 200
    recent_ids = [item["id"] for item in recent_res.json()["data"]]
    assert len(recent_ids) == 5
    assert asset_ids[0] not in recent_ids
    assert asset_ids[-1] in recent_ids

    restore_old_res = client.post(f"/api/v1/assets/{asset_ids[0]}/restore", headers=super_headers)
    assert restore_old_res.status_code == 400
    assert restore_old_res.json()["detail"] == "仅支持恢复最近删除的 5 个设备"

    restore_recent_res = client.post(f"/api/v1/assets/{asset_ids[-1]}/restore", headers=super_headers)
    assert restore_recent_res.status_code == 200
    assert restore_recent_res.json()["data"]["is_active"] is True

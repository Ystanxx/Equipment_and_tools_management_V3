from app.core.security import hash_password
from app.models.user import User
from app.utils.enums import AssetType, UserRole, UserStatus


def _create_admin(db, username: str, full_name: str) -> User:
    user = User(
        username=username,
        email=f"{username}@test.com",
        hashed_password=hash_password("testpass"),
        full_name=full_name,
        role=UserRole.ASSET_ADMIN,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_asset(client, auth_headers, *, category_id: str, location_id: str, admin_id: str, name: str) -> str:
    response = client.post(
        "/api/v1/assets",
        headers=auth_headers,
        json={
            "name": name,
            "asset_type": AssetType.DEVICE.value,
            "category_id": category_id,
            "location_id": location_id,
            "admin_id": admin_id,
        },
    )
    assert response.status_code == 200
    return response.json()["data"]["id"]


def test_rejecting_split_borrow_order_restores_all_assets(client, db, auth_headers):
    admin_one = _create_admin(db, "asset_admin_one", "管理员一")
    admin_two = _create_admin(db, "asset_admin_two", "管理员二")

    category_id = client.post(
        "/api/v1/asset-categories",
        headers=auth_headers,
        json={"name": "借用流程分类"},
    ).json()["data"]["id"]
    location_id = client.post(
        "/api/v1/storage-locations",
        headers=auth_headers,
        json={"name": "借用流程位置", "code": "FLOW01", "building": "B", "room": "201"},
    ).json()["data"]["id"]

    first_asset_id = _create_asset(
        client,
        auth_headers,
        category_id=category_id,
        location_id=location_id,
        admin_id=str(admin_one.id),
        name="多管理员借用设备一",
    )
    second_asset_id = _create_asset(
        client,
        auth_headers,
        category_id=category_id,
        location_id=location_id,
        admin_id=str(admin_two.id),
        name="多管理员借用设备二",
    )

    order = client.post(
        "/api/v1/borrow-orders",
        headers=auth_headers,
        json={
            "asset_ids": [first_asset_id, second_asset_id],
            "purpose": "多管理员驳回回滚测试",
        },
    )
    assert order.status_code == 200

    tasks = order.json()["data"]["approval_tasks"]
    assert len(tasks) == 2

    approve_response = client.post(
        f"/api/v1/borrow-approval-tasks/{tasks[0]['id']}/approve",
        headers=auth_headers,
        json={"comment": "先通过一条"},
    )
    assert approve_response.status_code == 200

    reject_response = client.post(
        f"/api/v1/borrow-approval-tasks/{tasks[1]['id']}/reject",
        headers=auth_headers,
        json={"comment": "再驳回另一条"},
    )
    assert reject_response.status_code == 200

    order_detail = client.get(f"/api/v1/borrow-orders/{order.json()['data']['id']}", headers=auth_headers)
    assert order_detail.status_code == 200
    assert order_detail.json()["data"]["status"] == "REJECTED"

    first_asset = client.get(f"/api/v1/assets/{first_asset_id}", headers=auth_headers).json()["data"]
    second_asset = client.get(f"/api/v1/assets/{second_asset_id}", headers=auth_headers).json()["data"]
    assert first_asset["status"] == "IN_STOCK"
    assert second_asset["status"] == "IN_STOCK"

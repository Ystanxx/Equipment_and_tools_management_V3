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


def _create_category_and_location(client, headers):
    category_id = client.post(
        "/api/v1/asset-categories",
        json={"name": "权限测试分类", "description": "权限测试分类"},
        headers=headers,
    ).json()["data"]["id"]
    location_id = client.post(
        "/api/v1/storage-locations",
        json={"name": "权限测试位置", "code": "SCOPE01", "building": "A楼", "room": "101"},
        headers=headers,
    ).json()["data"]["id"]
    return category_id, location_id


def _create_ready_for_pickup_order(client, headers, *, asset_id: str):
    order_res = client.post(
        "/api/v1/borrow-orders",
        headers=headers,
        json={"asset_ids": [asset_id], "purpose": "待交付权限测试"},
    )
    assert order_res.status_code == 200
    order_data = order_res.json()["data"]
    task_id = order_data["approval_tasks"][0]["id"]

    approve_res = client.post(
        f"/api/v1/borrow-approval-tasks/{task_id}/approve",
        headers=headers,
        json={"comment": "审批通过"},
    )
    assert approve_res.status_code == 200

    detail_res = client.get(f"/api/v1/borrow-orders/{order_data['id']}", headers=headers)
    assert detail_res.status_code == 200
    assert detail_res.json()["data"]["status"] == "READY_FOR_PICKUP"
    return detail_res.json()["data"]


def _create_approved_return_order(client, headers, *, borrow_order: dict, asset_id: str):
    item_id = borrow_order["items"][0]["id"]
    return_res = client.post(
        "/api/v1/return-orders",
        headers=headers,
        json={
            "borrow_order_id": borrow_order["id"],
            "items": [
                {
                    "borrow_order_item_id": item_id,
                    "asset_id": asset_id,
                    "condition": "GOOD",
                }
            ],
            "remark": "待入库权限测试",
        },
    )
    assert return_res.status_code == 200
    return_data = return_res.json()["data"]
    task_id = return_data["approval_tasks"][0]["id"]

    approve_res = client.post(
        f"/api/v1/return-approval-tasks/{task_id}/approve",
        headers=headers,
        json={"comment": "归还审批通过"},
    )
    assert approve_res.status_code == 200

    detail_res = client.get(f"/api/v1/return-orders/{return_data['id']}", headers=headers)
    assert detail_res.status_code == 200
    assert detail_res.json()["data"]["status"] == "APPROVED"
    return detail_res.json()["data"]


def test_asset_admin_can_list_but_cannot_manage_categories_and_locations(client, db, asset_type_ids):
    _, super_headers = _login_as_role(client, db, "scope_super", UserRole.SUPER_ADMIN)
    asset_admin, admin_headers = _login_as_role(client, db, "scope_asset_admin", UserRole.ASSET_ADMIN)

    create_asset_type_res = client.post(
        "/api/v1/asset-types",
        json={"name": "测试资产性质", "description": "测试性质"},
        headers=super_headers,
    )
    assert create_asset_type_res.status_code == 200
    asset_type_id = create_asset_type_res.json()["data"]["id"]

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

    list_asset_type_res = client.get("/api/v1/asset-types", headers=admin_headers)
    assert list_asset_type_res.status_code == 200
    assert len(list_asset_type_res.json()["data"]) >= 2

    list_category_res = client.get("/api/v1/asset-categories", headers=admin_headers)
    assert list_category_res.status_code == 200
    assert len(list_category_res.json()["data"]) == 1

    list_location_res = client.get("/api/v1/storage-locations", headers=admin_headers)
    assert list_location_res.status_code == 200
    assert len(list_location_res.json()["data"]) == 1

    for method, path, payload in [
        ("post", "/api/v1/asset-types", {"name": "新性质"}),
        ("put", f"/api/v1/asset-types/{asset_type_id}", {"description": "修改性质说明"}),
        ("delete", f"/api/v1/asset-types/{asset_type_id}", None),
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
        "asset_type_id": asset_type_ids["固定资产"],
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


def test_asset_admin_cannot_edit_other_admin_asset(client, db, asset_type_ids):
    _, super_headers = _login_as_role(client, db, "owner_super", UserRole.SUPER_ADMIN)
    owner_admin, _ = _login_as_role(client, db, "owner_admin", UserRole.ASSET_ADMIN)
    _, other_admin_headers = _login_as_role(client, db, "other_admin", UserRole.ASSET_ADMIN)

    create_asset_res = client.post(
        "/api/v1/assets",
        json={
            "name": "他人设备",
            "asset_type_id": asset_type_ids["固定资产"],
            "admin_id": str(owner_admin.id),
        },
        headers=super_headers,
    )
    assert create_asset_res.status_code == 200
    asset_id = create_asset_res.json()["data"]["id"]

    update_asset_res = client.put(
        f"/api/v1/assets/{asset_id}",
        json={"brand": "Should Fail"},
        headers=other_admin_headers,
    )
    assert update_asset_res.status_code == 403
    assert update_asset_res.json()["detail"] == "只能编辑自己负责的设备"


def test_super_admin_can_update_asset_admin_via_asset_edit_api(client, db, asset_type_ids):
    _, super_headers = _login_as_role(client, db, "edit_super", UserRole.SUPER_ADMIN)
    owner_admin, _ = _login_as_role(client, db, "edit_owner_admin", UserRole.ASSET_ADMIN)
    target_admin, _ = _login_as_role(client, db, "edit_target_admin", UserRole.ASSET_ADMIN)

    create_asset_res = client.post(
        "/api/v1/assets",
        json={
            "name": "超管改管理员设备",
            "asset_type_id": asset_type_ids["固定资产"],
            "admin_id": str(owner_admin.id),
        },
        headers=super_headers,
    )
    assert create_asset_res.status_code == 200
    asset_id = create_asset_res.json()["data"]["id"]

    update_asset_res = client.put(
        f"/api/v1/assets/{asset_id}",
        json={"admin_id": str(target_admin.id)},
        headers=super_headers,
    )
    assert update_asset_res.status_code == 200
    assert update_asset_res.json()["data"]["admin_id"] == str(target_admin.id)


def test_asset_admin_cannot_update_asset_admin_via_asset_edit_api(client, db, asset_type_ids):
    _, super_headers = _login_as_role(client, db, "edit_scope_super", UserRole.SUPER_ADMIN)
    owner_admin, owner_headers = _login_as_role(client, db, "edit_scope_owner", UserRole.ASSET_ADMIN)
    target_admin, _ = _login_as_role(client, db, "edit_scope_target", UserRole.ASSET_ADMIN)

    create_asset_res = client.post(
        "/api/v1/assets",
        json={
            "name": "资产管理员不可改归属设备",
            "asset_type_id": asset_type_ids["固定资产"],
            "admin_id": str(owner_admin.id),
        },
        headers=super_headers,
    )
    assert create_asset_res.status_code == 200
    asset_id = create_asset_res.json()["data"]["id"]

    update_asset_res = client.put(
        f"/api/v1/assets/{asset_id}",
        json={"admin_id": str(target_admin.id)},
        headers=owner_headers,
    )
    assert update_asset_res.status_code == 403
    assert update_asset_res.json()["detail"] == "只有超管可以修改设备管理员"


def test_asset_admin_only_sees_and_delivers_own_ready_orders(client, db, asset_type_ids):
    _, super_headers = _login_as_role(client, db, "deliver_super", UserRole.SUPER_ADMIN)
    owner_admin, owner_headers = _login_as_role(client, db, "deliver_owner", UserRole.ASSET_ADMIN)
    _, other_headers = _login_as_role(client, db, "deliver_other", UserRole.ASSET_ADMIN)

    category_id, location_id = _create_category_and_location(client, super_headers)
    create_asset_res = client.post(
        "/api/v1/assets",
        json={
            "name": "待交付测试设备",
            "asset_type_id": asset_type_ids["固定资产"],
            "category_id": category_id,
            "location_id": location_id,
            "admin_id": str(owner_admin.id),
        },
        headers=super_headers,
    )
    assert create_asset_res.status_code == 200
    asset_id = create_asset_res.json()["data"]["id"]

    borrow_order = _create_ready_for_pickup_order(client, super_headers, asset_id=asset_id)

    owner_list_res = client.get(
        "/api/v1/borrow-orders",
        params={"managed": True, "status": "READY_FOR_PICKUP"},
        headers=owner_headers,
    )
    assert owner_list_res.status_code == 200
    assert owner_list_res.json()["data"]["total"] == 1

    other_list_res = client.get(
        "/api/v1/borrow-orders",
        params={"managed": True, "status": "READY_FOR_PICKUP"},
        headers=other_headers,
    )
    assert other_list_res.status_code == 200
    assert other_list_res.json()["data"]["total"] == 0

    denied_res = client.post(f"/api/v1/borrow-orders/{borrow_order['id']}/deliver", headers=other_headers)
    assert denied_res.status_code == 403
    assert denied_res.json()["detail"] == "只能确认自己负责设备的交付"

    delivered_res = client.post(f"/api/v1/borrow-orders/{borrow_order['id']}/deliver", headers=owner_headers)
    assert delivered_res.status_code == 200
    assert delivered_res.json()["data"]["status"] == "DELIVERED"


def test_asset_admin_only_sees_and_stocks_in_own_returns(client, db, asset_type_ids):
    _, super_headers = _login_as_role(client, db, "stockin_super", UserRole.SUPER_ADMIN)
    owner_admin, owner_headers = _login_as_role(client, db, "stockin_owner", UserRole.ASSET_ADMIN)
    _, other_headers = _login_as_role(client, db, "stockin_other", UserRole.ASSET_ADMIN)

    category_id, location_id = _create_category_and_location(client, super_headers)
    create_asset_res = client.post(
        "/api/v1/assets",
        json={
            "name": "待入库测试设备",
            "asset_type_id": asset_type_ids["固定资产"],
            "category_id": category_id,
            "location_id": location_id,
            "admin_id": str(owner_admin.id),
        },
        headers=super_headers,
    )
    assert create_asset_res.status_code == 200
    asset_id = create_asset_res.json()["data"]["id"]

    borrow_order = _create_ready_for_pickup_order(client, super_headers, asset_id=asset_id)
    deliver_res = client.post(f"/api/v1/borrow-orders/{borrow_order['id']}/deliver", headers=owner_headers)
    assert deliver_res.status_code == 200

    return_order = _create_approved_return_order(client, super_headers, borrow_order=borrow_order, asset_id=asset_id)

    owner_list_res = client.get(
        "/api/v1/return-orders",
        params={"managed": True, "status": "APPROVED"},
        headers=owner_headers,
    )
    assert owner_list_res.status_code == 200
    assert owner_list_res.json()["data"]["total"] == 1

    other_list_res = client.get(
        "/api/v1/return-orders",
        params={"managed": True, "status": "APPROVED"},
        headers=other_headers,
    )
    assert other_list_res.status_code == 200
    assert other_list_res.json()["data"]["total"] == 0

    denied_res = client.post(f"/api/v1/return-orders/{return_order['id']}/stock-in", headers=other_headers)
    assert denied_res.status_code == 403
    assert denied_res.json()["detail"] == "只能确认自己负责设备的入库"

    stock_in_res = client.post(f"/api/v1/return-orders/{return_order['id']}/stock-in", headers=owner_headers)
    assert stock_in_res.status_code == 200
    assert stock_in_res.json()["data"]["status"] == "COMPLETED"


def test_asset_admin_applicant_can_view_own_borrow_and_return_orders(client, db, asset_type_ids):
    _, super_headers = _login_as_role(client, db, "selfapp_super", UserRole.SUPER_ADMIN)
    owner_admin, _ = _login_as_role(client, db, "selfapp_owner", UserRole.ASSET_ADMIN)
    applicant_admin, applicant_headers = _login_as_role(client, db, "selfapp_applicant", UserRole.ASSET_ADMIN)

    category_id, location_id = _create_category_and_location(client, super_headers)
    create_asset_res = client.post(
        "/api/v1/assets",
        json={
            "name": "他管我借设备",
            "asset_type_id": asset_type_ids["固定资产"],
            "category_id": category_id,
            "location_id": location_id,
            "admin_id": str(owner_admin.id),
        },
        headers=super_headers,
    )
    assert create_asset_res.status_code == 200
    asset_id = create_asset_res.json()["data"]["id"]

    order_res = client.post(
        "/api/v1/borrow-orders",
        headers=applicant_headers,
        json={"asset_ids": [asset_id], "purpose": "申请人权限测试"},
    )
    assert order_res.status_code == 200
    borrow_order = order_res.json()["data"]

    borrow_detail_res = client.get(f"/api/v1/borrow-orders/{borrow_order['id']}", headers=applicant_headers)
    assert borrow_detail_res.status_code == 200

    equipment_order_id = borrow_order["equipment_order_id"]
    equipment_detail_res = client.get(f"/api/v1/equipment-orders/{equipment_order_id}", headers=applicant_headers)
    assert equipment_detail_res.status_code == 200

    task_id = borrow_order["approval_tasks"][0]["id"]
    approve_res = client.post(
        f"/api/v1/borrow-approval-tasks/{task_id}/approve",
        headers=super_headers,
        json={"comment": "审批通过"},
    )
    assert approve_res.status_code == 200

    deliver_res = client.post(f"/api/v1/borrow-orders/{borrow_order['id']}/deliver", headers=super_headers)
    assert deliver_res.status_code == 200

    return_res = client.post(
        "/api/v1/return-orders",
        headers=applicant_headers,
        json={
            "borrow_order_id": borrow_order["id"],
            "items": [
                {
                    "borrow_order_item_id": borrow_order["items"][0]["id"],
                    "asset_id": asset_id,
                    "condition": "GOOD",
                }
            ],
            "remark": "申请人归还权限测试",
        },
    )
    assert return_res.status_code == 200
    return_order = return_res.json()["data"]

    return_detail_res = client.get(f"/api/v1/return-orders/{return_order['id']}", headers=applicant_headers)
    assert return_detail_res.status_code == 200


def test_asset_admin_cannot_view_unrelated_equipment_order(client, db, asset_type_ids):
    _, super_headers = _login_as_role(client, db, "eqscope_super", UserRole.SUPER_ADMIN)
    owner_admin, _ = _login_as_role(client, db, "eqscope_owner", UserRole.ASSET_ADMIN)
    _, other_admin_headers = _login_as_role(client, db, "eqscope_other", UserRole.ASSET_ADMIN)
    user, user_headers = _login_as_role(client, db, "eqscope_user", UserRole.USER)

    category_id, location_id = _create_category_and_location(client, super_headers)
    create_asset_res = client.post(
        "/api/v1/assets",
        json={
            "name": "统一订单权限设备",
            "asset_type_id": asset_type_ids["固定资产"],
            "category_id": category_id,
            "location_id": location_id,
            "admin_id": str(owner_admin.id),
        },
        headers=super_headers,
    )
    assert create_asset_res.status_code == 200
    asset_id = create_asset_res.json()["data"]["id"]

    order_res = client.post(
        "/api/v1/borrow-orders",
        headers=user_headers,
        json={"asset_ids": [asset_id], "purpose": "统一订单权限测试"},
    )
    assert order_res.status_code == 200
    equipment_order_id = order_res.json()["data"]["equipment_order_id"]

    denied_res = client.get(f"/api/v1/equipment-orders/{equipment_order_id}", headers=other_admin_headers)
    assert denied_res.status_code == 403
    assert denied_res.json()["detail"] == "无权查看该订单"

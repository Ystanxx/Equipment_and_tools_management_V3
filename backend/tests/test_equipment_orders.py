from app.core.security import hash_password
from app.models.borrow_order import BorrowOrder
from app.models.equipment_order import EquipmentOrder
from app.models.user import User
from app.utils.enums import EquipmentOrderStatus, UserRole, UserStatus


def _create_asset_admin(db, username: str, full_name: str) -> User:
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


def _create_base_refs(client, auth_headers):
    category_id = client.post(
        "/api/v1/asset-categories",
        headers=auth_headers,
        json={"name": "统一订单测试分类"},
    ).json()["data"]["id"]
    location_id = client.post(
        "/api/v1/storage-locations",
        headers=auth_headers,
        json={"name": "统一订单测试位置", "code": "EO01", "building": "B", "room": "301"},
    ).json()["data"]["id"]
    return category_id, location_id


def _login_headers(client, username: str, password: str = "testpass") -> dict:
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_borrow_order_creates_equipment_order_and_tracks_borrow_reject(client, db, auth_headers, asset_type_ids):
    admin = _create_asset_admin(db, "equipment_admin_one", "设备管理员一")
    category_id, location_id = _create_base_refs(client, auth_headers)
    asset_id = _create_asset(
        client,
        auth_headers,
        category_id=category_id,
        location_id=location_id,
        admin_id=str(admin.id),
        name="统一订单借出驳回设备",
        asset_type_id=asset_type_ids["固定资产"],
    )

    response = client.post(
        "/api/v1/borrow-orders",
        headers=auth_headers,
        json={"asset_ids": [asset_id], "purpose": "统一订单借出驳回"},
    )
    assert response.status_code == 200
    payload = response.json()["data"]

    db.expire_all()
    borrow_order = db.query(BorrowOrder).filter(BorrowOrder.id == payload["id"]).first()
    equipment_order = db.query(EquipmentOrder).filter(EquipmentOrder.id == borrow_order.equipment_order_id).first()
    assert equipment_order is not None
    assert equipment_order.order_no == borrow_order.order_no
    assert equipment_order.status == EquipmentOrderStatus.PENDING_BORROW_APPROVAL

    reject_response = client.post(
        f"/api/v1/borrow-approval-tasks/{payload['approval_tasks'][0]['id']}/reject",
        headers=auth_headers,
        json={"comment": "拒绝借出"},
    )
    assert reject_response.status_code == 200

    db.expire_all()
    equipment_order = db.query(EquipmentOrder).filter(EquipmentOrder.id == borrow_order.equipment_order_id).first()
    assert equipment_order.status == EquipmentOrderStatus.BORROW_REJECTED


def test_equipment_order_tracks_return_reject_and_complete(client, db, auth_headers, asset_type_ids):
    admin = _create_asset_admin(db, "equipment_admin_two", "设备管理员二")
    category_id, location_id = _create_base_refs(client, auth_headers)
    asset_id = _create_asset(
        client,
        auth_headers,
        category_id=category_id,
        location_id=location_id,
        admin_id=str(admin.id),
        name="统一订单归还流转设备",
        asset_type_id=asset_type_ids["固定资产"],
    )

    borrow_response = client.post(
        "/api/v1/borrow-orders",
        headers=auth_headers,
        json={"asset_ids": [asset_id], "purpose": "统一订单归还状态"},
    )
    assert borrow_response.status_code == 200
    borrow_payload = borrow_response.json()["data"]
    borrow_task_id = borrow_payload["approval_tasks"][0]["id"]

    approve_response = client.post(
        f"/api/v1/borrow-approval-tasks/{borrow_task_id}/approve",
        headers=auth_headers,
        json={"comment": "通过借出"},
    )
    assert approve_response.status_code == 200

    deliver_response = client.post(
        f"/api/v1/borrow-orders/{borrow_payload['id']}/deliver",
        headers=auth_headers,
    )
    assert deliver_response.status_code == 200

    item = borrow_payload["items"][0]
    first_return_response = client.post(
        "/api/v1/return-orders",
        headers=auth_headers,
        json={
            "borrow_order_id": borrow_payload["id"],
            "items": [
                {
                    "borrow_order_item_id": item["id"],
                    "asset_id": asset_id,
                    "condition": "GOOD",
                }
            ],
        },
    )
    assert first_return_response.status_code == 200
    first_return_payload = first_return_response.json()["data"]

    reject_return_response = client.post(
        f"/api/v1/return-approval-tasks/{first_return_payload['approval_tasks'][0]['id']}/reject",
        headers=auth_headers,
        json={"comment": "照片不清晰"},
    )
    assert reject_return_response.status_code == 200

    db.expire_all()
    borrow_order = db.query(BorrowOrder).filter(BorrowOrder.id == borrow_payload["id"]).first()
    equipment_order = db.query(EquipmentOrder).filter(EquipmentOrder.id == borrow_order.equipment_order_id).first()
    assert equipment_order.status == EquipmentOrderStatus.RETURN_REJECTED

    second_return_response = client.post(
        "/api/v1/return-orders",
        headers=auth_headers,
        json={
            "borrow_order_id": borrow_payload["id"],
            "items": [
                {
                    "borrow_order_item_id": item["id"],
                    "asset_id": asset_id,
                    "condition": "GOOD",
                }
            ],
        },
    )
    assert second_return_response.status_code == 200
    second_return_payload = second_return_response.json()["data"]

    approve_return_response = client.post(
        f"/api/v1/return-approval-tasks/{second_return_payload['approval_tasks'][0]['id']}/approve",
        headers=auth_headers,
        json={"comment": "归还通过"},
    )
    assert approve_return_response.status_code == 200

    db.expire_all()
    equipment_order = db.query(EquipmentOrder).filter(EquipmentOrder.id == borrow_order.equipment_order_id).first()
    assert equipment_order.status == EquipmentOrderStatus.PARTIALLY_RETURNED

    detail_response = client.get(
        f"/api/v1/equipment-orders/{borrow_payload['equipment_order_id']}",
        headers=auth_headers,
    )
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["status"] == "PENDING_STOCK_IN"

    stock_in_response = client.post(
        f"/api/v1/return-orders/{second_return_payload['id']}/stock-in",
        headers=auth_headers,
    )
    assert stock_in_response.status_code == 200

    db.expire_all()
    equipment_order = db.query(EquipmentOrder).filter(EquipmentOrder.id == borrow_order.equipment_order_id).first()
    assert equipment_order.status == EquipmentOrderStatus.COMPLETED


def test_equipment_order_api_returns_unified_order_and_timeline(client, db, auth_headers, asset_type_ids):
    admin = _create_asset_admin(db, "equipment_admin_three", "设备管理员三")
    category_id, location_id = _create_base_refs(client, auth_headers)
    asset_id = _create_asset(
        client,
        auth_headers,
        category_id=category_id,
        location_id=location_id,
        admin_id=str(admin.id),
        name="统一订单接口测试设备",
        asset_type_id=asset_type_ids["固定资产"],
    )

    borrow_response = client.post(
        "/api/v1/borrow-orders",
        headers=auth_headers,
        json={"asset_ids": [asset_id], "purpose": "统一订单接口校验"},
    )
    assert borrow_response.status_code == 200
    borrow_payload = borrow_response.json()["data"]

    list_response = client.get("/api/v1/equipment-orders?mine=true", headers=auth_headers)
    assert list_response.status_code == 200
    list_items = list_response.json()["data"]["items"]
    assert len(list_items) == 1
    assert list_items[0]["order_no"] == borrow_payload["order_no"]
    assert list_items[0]["status"] == "PENDING_BORROW_APPROVAL"

    detail_response = client.get(
        f"/api/v1/equipment-orders/{borrow_payload['equipment_order_id']}",
        headers=auth_headers,
    )
    assert detail_response.status_code == 200
    detail = detail_response.json()["data"]
    assert detail["borrow_order"]["id"] == borrow_payload["id"]
    assert detail["item_count"] == 1
    assert detail["items"][0]["asset_code_snapshot"]

    timeline_response = client.get(
        f"/api/v1/equipment-orders/{borrow_payload['equipment_order_id']}/timeline",
        headers=auth_headers,
    )
    assert timeline_response.status_code == 200
    timeline = timeline_response.json()["data"]
    assert len(timeline) >= 1
    assert timeline[0]["equipment_order_id"] == borrow_payload["equipment_order_id"]


def test_return_approval_filters_pending_stock_in_and_completed(client, db, auth_headers, asset_type_ids):
    admin = _create_asset_admin(db, "equipment_admin_five", "设备管理员五")
    category_id, location_id = _create_base_refs(client, auth_headers)
    asset_id = _create_asset(
        client,
        auth_headers,
        category_id=category_id,
        location_id=location_id,
        admin_id=str(admin.id),
        name="归还审批筛选测试设备",
        asset_type_id=asset_type_ids["固定资产"],
    )

    borrow_response = client.post(
        "/api/v1/borrow-orders",
        headers=auth_headers,
        json={"asset_ids": [asset_id], "purpose": "归还审批筛选校验"},
    )
    assert borrow_response.status_code == 200
    borrow_payload = borrow_response.json()["data"]

    approve_response = client.post(
        f"/api/v1/borrow-approval-tasks/{borrow_payload['approval_tasks'][0]['id']}/approve",
        headers=auth_headers,
        json={"comment": "通过借出"},
    )
    assert approve_response.status_code == 200

    deliver_response = client.post(
        f"/api/v1/borrow-orders/{borrow_payload['id']}/deliver",
        headers=auth_headers,
    )
    assert deliver_response.status_code == 200

    item = borrow_payload["items"][0]
    return_response = client.post(
        "/api/v1/return-orders",
        headers=auth_headers,
        json={
            "borrow_order_id": borrow_payload["id"],
            "items": [
                {
                    "borrow_order_item_id": item["id"],
                    "asset_id": asset_id,
                    "condition": "GOOD",
                }
            ],
        },
    )
    assert return_response.status_code == 200
    return_payload = return_response.json()["data"]

    approve_return_response = client.post(
        f"/api/v1/return-approval-tasks/{return_payload['approval_tasks'][0]['id']}/approve",
        headers=auth_headers,
        json={"comment": "归还通过"},
    )
    assert approve_return_response.status_code == 200

    pending_stock_in_response = client.get(
        "/api/v1/return-approval-tasks?status=PENDING_STOCK_IN",
        headers=auth_headers,
    )
    assert pending_stock_in_response.status_code == 200
    pending_items = pending_stock_in_response.json()["data"]["items"]
    assert len(pending_items) == 1
    assert pending_items[0]["return_order_status"] == "APPROVED"

    completed_before_stock_in = client.get(
        "/api/v1/return-approval-tasks?status=COMPLETED",
        headers=auth_headers,
    )
    assert completed_before_stock_in.status_code == 200
    assert completed_before_stock_in.json()["data"]["total"] == 0

    stock_in_response = client.post(
        f"/api/v1/return-orders/{return_payload['id']}/stock-in",
        headers=auth_headers,
    )
    assert stock_in_response.status_code == 200

    completed_after_stock_in = client.get(
        "/api/v1/return-approval-tasks?status=COMPLETED",
        headers=auth_headers,
    )
    assert completed_after_stock_in.status_code == 200
    completed_items = completed_after_stock_in.json()["data"]["items"]
    assert len(completed_items) == 1
    assert completed_items[0]["return_order_status"] == "COMPLETED"


def test_applicant_can_still_see_order_after_approval_and_delivery(client, db, auth_headers, asset_type_ids):
    admin = _create_asset_admin(db, "equipment_admin_four", "设备管理员四")
    category_id, location_id = _create_base_refs(client, auth_headers)
    asset_id = _create_asset(
        client,
        auth_headers,
        category_id=category_id,
        location_id=location_id,
        admin_id=str(admin.id),
        name="统一订单交付后可见设备",
        asset_type_id=asset_type_ids["固定资产"],
    )

    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "order_user_one",
            "email": "order_user_one@test.com",
            "password": "testpass",
            "full_name": "统一订单用户一",
        },
    )
    assert register_response.status_code == 200

    user = db.query(User).filter(User.username == "order_user_one").first()
    user.status = UserStatus.ACTIVE
    db.commit()

    user_headers = _login_headers(client, "order_user_one")

    borrow_response = client.post(
        "/api/v1/borrow-orders",
        headers=user_headers,
        json={"asset_ids": [asset_id], "purpose": "交付后仍应可见"},
    )
    assert borrow_response.status_code == 200
    borrow_payload = borrow_response.json()["data"]

    task_list_response = client.get("/api/v1/borrow-approval-tasks?status=PENDING", headers=auth_headers)
    assert task_list_response.status_code == 200
    task_payload = task_list_response.json()["data"]["items"][0]
    assert task_payload["equipment_order_id"] == borrow_payload["equipment_order_id"]

    approve_response = client.post(
        f"/api/v1/borrow-approval-tasks/{borrow_payload['approval_tasks'][0]['id']}/approve",
        headers=auth_headers,
        json={"comment": "通过借出"},
    )
    assert approve_response.status_code == 200

    deliver_response = client.post(
        f"/api/v1/borrow-orders/{borrow_payload['id']}/deliver",
        headers=auth_headers,
    )
    assert deliver_response.status_code == 200

    list_response = client.get("/api/v1/equipment-orders?mine=true", headers=user_headers)
    assert list_response.status_code == 200
    list_items = list_response.json()["data"]["items"]
    assert len(list_items) == 1
    assert list_items[0]["id"] == borrow_payload["equipment_order_id"]
    assert list_items[0]["status"] == "BORROWED"

    detail_response = client.get(
        f"/api/v1/equipment-orders/{borrow_payload['equipment_order_id']}",
        headers=user_headers,
    )
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["borrow_order"]["status"] == "DELIVERED"


def test_equipment_order_list_supports_status_group_filter(client, db, auth_headers, asset_type_ids):
    admin = _create_asset_admin(db, "equipment_admin_filter", "设备管理员筛选")
    category_id, location_id = _create_base_refs(client, auth_headers)

    in_progress_asset_id = _create_asset(
        client,
        auth_headers,
        category_id=category_id,
        location_id=location_id,
        admin_id=str(admin.id),
        name="统一订单筛选进行中设备",
        asset_type_id=asset_type_ids["固定资产"],
    )
    completed_asset_id = _create_asset(
        client,
        auth_headers,
        category_id=category_id,
        location_id=location_id,
        admin_id=str(admin.id),
        name="统一订单筛选已完成设备",
        asset_type_id=asset_type_ids["固定资产"],
    )

    in_progress_response = client.post(
        "/api/v1/borrow-orders",
        headers=auth_headers,
        json={"asset_ids": [in_progress_asset_id], "purpose": "筛选进行中订单"},
    )
    assert in_progress_response.status_code == 200
    in_progress_payload = in_progress_response.json()["data"]

    completed_response = client.post(
        "/api/v1/borrow-orders",
        headers=auth_headers,
        json={"asset_ids": [completed_asset_id], "purpose": "筛选已完成订单"},
    )
    assert completed_response.status_code == 200
    completed_payload = completed_response.json()["data"]

    approve_borrow_response = client.post(
        f"/api/v1/borrow-approval-tasks/{completed_payload['approval_tasks'][0]['id']}/approve",
        headers=auth_headers,
        json={"comment": "通过借出"},
    )
    assert approve_borrow_response.status_code == 200

    deliver_response = client.post(
        f"/api/v1/borrow-orders/{completed_payload['id']}/deliver",
        headers=auth_headers,
    )
    assert deliver_response.status_code == 200

    completed_item = completed_payload["items"][0]
    return_response = client.post(
        "/api/v1/return-orders",
        headers=auth_headers,
        json={
            "borrow_order_id": completed_payload["id"],
            "items": [
                {
                    "borrow_order_item_id": completed_item["id"],
                    "asset_id": completed_asset_id,
                    "condition": "GOOD",
                }
            ],
        },
    )
    assert return_response.status_code == 200
    return_payload = return_response.json()["data"]

    approve_return_response = client.post(
        f"/api/v1/return-approval-tasks/{return_payload['approval_tasks'][0]['id']}/approve",
        headers=auth_headers,
        json={"comment": "归还通过"},
    )
    assert approve_return_response.status_code == 200

    stock_in_response = client.post(
        f"/api/v1/return-orders/{return_payload['id']}/stock-in",
        headers=auth_headers,
    )
    assert stock_in_response.status_code == 200

    in_progress_list = client.get(
        "/api/v1/equipment-orders?mine=true&status_group=IN_PROGRESS",
        headers=auth_headers,
    )
    assert in_progress_list.status_code == 200
    in_progress_items = in_progress_list.json()["data"]["items"]
    assert [item["id"] for item in in_progress_items] == [in_progress_payload["equipment_order_id"]]

    completed_list = client.get(
        "/api/v1/equipment-orders?mine=true&status_group=COMPLETED",
        headers=auth_headers,
    )
    assert completed_list.status_code == 200
    completed_items = completed_list.json()["data"]["items"]
    assert [item["id"] for item in completed_items] == [completed_payload["equipment_order_id"]]

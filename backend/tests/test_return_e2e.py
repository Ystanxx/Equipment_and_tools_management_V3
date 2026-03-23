"""手动联调归还流程脚本。"""

import os
import time

import httpx
import pytest


def _run_live_return_e2e() -> None:
    base = "http://localhost:8000/api/v1"
    tag = str(int(time.time()))[-6:]

    # 1. 管理员登录
    login_response = httpx.post(f"{base}/auth/login", json={"username": "admin", "password": "admin"})
    token = login_response.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me_response = httpx.get(f"{base}/auth/me", headers=headers)
    admin_user_id = me_response.json()["data"]["id"]
    print(f"1. Login OK, admin_id={admin_user_id}")

    # 2. 创建分类和位置
    category_response = httpx.post(f"{base}/asset-categories", json={"name": f"RT{tag}"}, headers=headers)
    category_id = category_response.json()["data"]["id"]

    location_response = httpx.post(
        f"{base}/storage-locations",
        json={"name": f"RT{tag}", "code": f"RT{tag}", "building": "C", "room": tag},
        headers=headers,
    )
    location_id = location_response.json()["data"]["id"]
    print("2. Category + Location created")

    # 3. 创建 3 台设备
    asset_ids: list[str] = []
    for index in range(3):
        asset_response = httpx.post(
            f"{base}/assets",
            json={
                "name": f"ReturnTest{tag}_{index + 1}",
                "asset_type": "DEVICE",
                "category_id": category_id,
                "location_id": location_id,
                "admin_id": admin_user_id,
            },
            headers=headers,
        )
        assert asset_response.status_code == 200, f"Asset create failed: {asset_response.text}"
        asset_ids.append(asset_response.json()["data"]["id"])
    print(f"3. Created {len(asset_ids)} assets")

    # 4. 提交借用单
    borrow_response = httpx.post(
        f"{base}/borrow-orders",
        json={"asset_ids": asset_ids, "purpose": "return E2E"},
        headers=headers,
    )
    assert borrow_response.status_code == 200, f"Borrow submit failed: {borrow_response.text}"
    borrow_order = borrow_response.json()["data"]
    borrow_order_id = borrow_order["id"]
    task_id = borrow_order["approval_tasks"][0]["id"]
    print(f"4. Borrow order: {borrow_order['order_no']} status={borrow_order['status']}")

    # 5. 审批并交付
    approve_response = httpx.post(f"{base}/borrow-approval-tasks/{task_id}/approve", json={}, headers=headers)
    assert approve_response.status_code == 200

    deliver_response = httpx.post(f"{base}/borrow-orders/{borrow_order_id}/deliver", json={}, headers=headers)
    assert deliver_response.status_code == 200
    delivered_status = deliver_response.json()["data"]["status"]
    print(f"5. Approved + delivered: status={delivered_status}")
    assert delivered_status == "DELIVERED"

    # 6. 部分归还
    borrow_detail = httpx.get(f"{base}/borrow-orders/{borrow_order_id}", headers=headers).json()["data"]
    items_to_return = [
        {
            "borrow_order_item_id": borrow_detail["items"][0]["id"],
            "asset_id": borrow_detail["items"][0]["asset_id"],
            "condition": "GOOD",
        },
        {
            "borrow_order_item_id": borrow_detail["items"][1]["id"],
            "asset_id": borrow_detail["items"][1]["asset_id"],
            "condition": "DAMAGED",
            "damage_description": "screen cracked",
        },
    ]
    return_response = httpx.post(
        f"{base}/return-orders",
        json={"borrow_order_id": borrow_order_id, "items": items_to_return, "remark": "partial"},
        headers=headers,
    )
    assert return_response.status_code == 200, f"Return submit failed: {return_response.text}"
    return_order = return_response.json()["data"]
    return_order_id = return_order["id"]
    return_task_id = return_order["approval_tasks"][0]["id"]
    print(f"6. Return order: {return_order['order_no']} status={return_order['status']} items={return_order['item_count']} tasks={len(return_order['approval_tasks'])}")

    # 7. 审批归还任务
    return_approve_response = httpx.post(
        f"{base}/return-approval-tasks/{return_task_id}/approve",
        json={"comment": "ok"},
        headers=headers,
    )
    assert return_approve_response.status_code == 200, f"Return approve failed: {return_approve_response.text}"
    print(f"7. Return task approved: {return_approve_response.json()['data']['status']}")

    # 8. 校验归还单状态
    return_detail_response = httpx.get(f"{base}/return-orders/{return_order_id}", headers=headers)
    return_status = return_detail_response.json()["data"]["status"]
    print(f"8. Return order status: {return_status}")
    assert return_status == "COMPLETED"

    # 9. 校验借用单状态
    borrow_partial_response = httpx.get(f"{base}/borrow-orders/{borrow_order_id}", headers=headers)
    borrow_partial_status = borrow_partial_response.json()["data"]["status"]
    print(f"9. Borrow order status after partial return: {borrow_partial_status}")
    assert borrow_partial_status == "PARTIALLY_RETURNED"

    # 10. 归还最后一件
    last_item_payload = [
        {
            "borrow_order_item_id": borrow_detail["items"][2]["id"],
            "asset_id": borrow_detail["items"][2]["asset_id"],
            "condition": "FULL_LOSS",
        },
    ]
    second_return_response = httpx.post(
        f"{base}/return-orders",
        json={"borrow_order_id": borrow_order_id, "items": last_item_payload},
        headers=headers,
    )
    assert second_return_response.status_code == 200, f"Return2 submit failed: {second_return_response.text}"
    second_return = second_return_response.json()["data"]
    second_task_id = second_return["approval_tasks"][0]["id"]
    print(f"10. Return order 2: {second_return['order_no']}")

    # 11. 审批第二次归还
    second_approve_response = httpx.post(
        f"{base}/return-approval-tasks/{second_task_id}/approve",
        json={},
        headers=headers,
    )
    assert second_approve_response.status_code == 200

    # 12. 借用单应完成
    borrow_final_response = httpx.get(f"{base}/borrow-orders/{borrow_order_id}", headers=headers)
    borrow_final_status = borrow_final_response.json()["data"]["status"]
    print(f"11-12. Borrow order final status: {borrow_final_status}")
    assert borrow_final_status == "COMPLETED"

    print("\n=== Phase 3 E2E test PASSED ===")


@pytest.mark.skipif(os.getenv("RUN_LIVE_E2E") != "1", reason="需要启动本地服务并显式设置 RUN_LIVE_E2E=1")
def test_return_e2e_live() -> None:
    _run_live_return_e2e()


if __name__ == "__main__":
    _run_live_return_e2e()

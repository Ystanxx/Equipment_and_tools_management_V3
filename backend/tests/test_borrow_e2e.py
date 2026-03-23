"""手动联调借用流程脚本。"""

import os
import time

import httpx
import pytest


def _run_live_borrow_e2e() -> None:
    base = "http://localhost:8000/api/v1"
    tag = str(int(time.time()))[-6:]

    # 1. 管理员登录
    response = httpx.post(f"{base}/auth/login", json={"username": "admin", "password": "admin"})
    token = response.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me_response = httpx.get(f"{base}/auth/me", headers=headers)
    admin_user_id = me_response.json()["data"]["id"]
    print(f"1. Login OK, admin_id={admin_user_id}")

    # 2. 创建分类
    category_response = httpx.post(
        f"{base}/asset-categories",
        json={"name": f"借用测试分类{tag}"},
        headers=headers,
    )
    assert category_response.status_code == 200, f"Category create failed: {category_response.status_code} {category_response.text}"
    category_id = category_response.json()["data"]["id"]
    print(f"2. Category created: {category_id}")

    # 3. 创建位置
    location_response = httpx.post(
        f"{base}/storage-locations",
        json={"name": f"B栋{tag}", "code": f"B{tag}", "building": "B栋", "room": tag},
        headers=headers,
    )
    assert location_response.status_code == 200, f"Location create failed: {location_response.status_code} {location_response.text}"
    location_id = location_response.json()["data"]["id"]
    print(f"3. Location created: {location_id}")

    # 4. 创建 2 台设备
    asset_ids: list[str] = []
    for index in range(2):
        asset_response = httpx.post(
            f"{base}/assets",
            json={
                "name": f"借用测试设备{tag}_{index + 1}",
                "asset_type": "DEVICE",
                "category_id": category_id,
                "location_id": location_id,
                "admin_id": admin_user_id,
            },
            headers=headers,
        )
        assert asset_response.status_code == 200, f"Asset create failed: {asset_response.status_code} {asset_response.text}"
        asset = asset_response.json()["data"]
        asset_ids.append(asset["id"])
        print(f"4. Asset {index + 1}: {asset['asset_code']}")

    # 5. 提交借用单
    order_response = httpx.post(
        f"{base}/borrow-orders",
        json={"asset_ids": asset_ids, "purpose": "E2E测试借用"},
        headers=headers,
    )
    assert order_response.status_code == 200, f"Submit failed: {order_response.text}"
    order = order_response.json()["data"]
    order_id = order["id"]
    tasks = order["approval_tasks"]
    print(f"5. Borrow order: {order['order_no']} status={order['status']} tasks={len(tasks)}")

    # 6. 审批通过
    task_id = tasks[0]["id"]
    approve_response = httpx.post(
        f"{base}/borrow-approval-tasks/{task_id}/approve",
        json={"comment": "同意"},
        headers=headers,
    )
    assert approve_response.status_code == 200, f"Approve failed: {approve_response.text}"
    print(f"6. Approve: task_status={approve_response.json()['data']['status']}")

    # 7. 校验借用单状态
    detail_response = httpx.get(f"{base}/borrow-orders/{order_id}", headers=headers)
    order_status = detail_response.json()["data"]["status"]
    print(f"7. Order status after approve: {order_status}")
    assert order_status == "READY_FOR_PICKUP", f"Expected READY_FOR_PICKUP, got {order_status}"

    # 8. 确认交付
    deliver_response = httpx.post(f"{base}/borrow-orders/{order_id}/deliver", json={}, headers=headers)
    assert deliver_response.status_code == 200, f"Deliver failed: {deliver_response.text}"
    print(f"8. Deliver: status={deliver_response.json()['data']['status']}")
    assert deliver_response.json()["data"]["status"] == "DELIVERED"

    print("\n=== Phase 2 E2E test PASSED ===")


@pytest.mark.skipif(os.getenv("RUN_LIVE_E2E") != "1", reason="需要启动本地服务并显式设置 RUN_LIVE_E2E=1")
def test_borrow_e2e_live() -> None:
    _run_live_borrow_e2e()


if __name__ == "__main__":
    _run_live_borrow_e2e()

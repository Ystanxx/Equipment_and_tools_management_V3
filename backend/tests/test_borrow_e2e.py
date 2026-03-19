"""Phase 2 end-to-end borrow flow test (run manually against live server)."""
import httpx
import time

base = "http://localhost:8000/api/v1"
tag = str(int(time.time()))[-6:]

# 1. Login as admin
r = httpx.post(f"{base}/auth/login", json={"username": "admin", "password": "admin"})
token = r.json()["data"]["access_token"]
h = {"Authorization": f"Bearer {token}"}
# Get admin user id
r2 = httpx.get(f"{base}/auth/me", headers=h)
admin_user_id = r2.json()["data"]["id"]
print(f"1. Login OK, admin_id={admin_user_id}")

# 2. Create a category
r = httpx.post(f"{base}/asset-categories", json={"name": f"借用测试分类{tag}"}, headers=h)
assert r.status_code == 200, f"Category create failed: {r.status_code} {r.text}"
cat_id = r.json()["data"]["id"]
print(f"2. Category created: {cat_id}")

# 3. Create a location
r = httpx.post(f"{base}/storage-locations", json={"name": f"B栋{tag}", "code": f"B{tag}", "building": "B栋", "room": tag}, headers=h)
assert r.status_code == 200, f"Location create failed: {r.status_code} {r.text}"
loc_id = r.json()["data"]["id"]
print(f"3. Location created: {loc_id}")

# 4. Create 2 assets
assets = []
for i in range(2):
    r = httpx.post(f"{base}/assets", json={"name": f"借用测试设备{tag}_{i+1}", "asset_type": "DEVICE", "category_id": cat_id, "location_id": loc_id, "admin_id": admin_user_id}, headers=h)
    assert r.status_code == 200, f"Asset create failed: {r.status_code} {r.text}"
    a = r.json()["data"]
    assets.append(a["id"])
    print(f"4. Asset {i+1}: {a['asset_code']}")

# 5. Submit borrow order
r = httpx.post(f"{base}/borrow-orders", json={"asset_ids": assets, "purpose": "E2E测试借用"}, headers=h)
assert r.status_code == 200, f"Submit failed: {r.text}"
order = r.json()["data"]
order_id = order["id"]
tasks = order["approval_tasks"]
print(f"5. Borrow order: {order['order_no']} status={order['status']} tasks={len(tasks)}")

# 6. Approve the task
task_id = tasks[0]["id"]
r = httpx.post(f"{base}/borrow-approval-tasks/{task_id}/approve", json={"comment": "同意"}, headers=h)
assert r.status_code == 200, f"Approve failed: {r.text}"
print(f"6. Approve: task_status={r.json()['data']['status']}")

# 7. Check order status -> should be READY_FOR_PICKUP
r = httpx.get(f"{base}/borrow-orders/{order_id}", headers=h)
status_after = r.json()["data"]["status"]
print(f"7. Order status after approve: {status_after}")
assert status_after == "READY_FOR_PICKUP", f"Expected READY_FOR_PICKUP, got {status_after}"

# 8. Deliver
r = httpx.post(f"{base}/borrow-orders/{order_id}/deliver", json={}, headers=h)
assert r.status_code == 200, f"Deliver failed: {r.text}"
print(f"8. Deliver: status={r.json()['data']['status']}")
assert r.json()["data"]["status"] == "DELIVERED"

print("\n=== Phase 2 E2E test PASSED ===")

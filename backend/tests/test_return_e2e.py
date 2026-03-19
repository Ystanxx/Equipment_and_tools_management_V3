"""Phase 3 end-to-end return flow test (run against live server)."""
import httpx
import time

base = "http://localhost:8000/api/v1"
tag = str(int(time.time()))[-6:]

# 1. Login as admin
r = httpx.post(f"{base}/auth/login", json={"username": "admin", "password": "admin"})
token = r.json()["data"]["access_token"]
h = {"Authorization": f"Bearer {token}"}
r2 = httpx.get(f"{base}/auth/me", headers=h)
admin_user_id = r2.json()["data"]["id"]
print(f"1. Login OK, admin_id={admin_user_id}")

# 2. Create category + location
r = httpx.post(f"{base}/asset-categories", json={"name": f"RT{tag}"}, headers=h)
cat_id = r.json()["data"]["id"]
r = httpx.post(f"{base}/storage-locations", json={"name": f"RT{tag}", "code": f"RT{tag}", "building": "C", "room": tag}, headers=h)
loc_id = r.json()["data"]["id"]
print("2. Category + Location created")

# 3. Create 3 assets
assets = []
for i in range(3):
    r = httpx.post(f"{base}/assets", json={
        "name": f"ReturnTest{tag}_{i+1}", "asset_type": "DEVICE",
        "category_id": cat_id, "location_id": loc_id, "admin_id": admin_user_id
    }, headers=h)
    assert r.status_code == 200, f"Asset create failed: {r.text}"
    assets.append(r.json()["data"]["id"])
print(f"3. Created {len(assets)} assets")

# 4. Submit borrow order
r = httpx.post(f"{base}/borrow-orders", json={"asset_ids": assets, "purpose": "return E2E"}, headers=h)
assert r.status_code == 200, f"Borrow submit failed: {r.text}"
bo = r.json()["data"]
bo_id = bo["id"]
task_id = bo["approval_tasks"][0]["id"]
print(f"4. Borrow order: {bo['order_no']} status={bo['status']}")

# 5. Approve + deliver
r = httpx.post(f"{base}/borrow-approval-tasks/{task_id}/approve", json={}, headers=h)
assert r.status_code == 200
r = httpx.post(f"{base}/borrow-orders/{bo_id}/deliver", json={}, headers=h)
assert r.status_code == 200
bo_status = r.json()["data"]["status"]
print(f"5. Approved + delivered: status={bo_status}")
assert bo_status == "DELIVERED"

# 6. Partial return (first 2 items)
bo_detail = httpx.get(f"{base}/borrow-orders/{bo_id}", headers=h).json()["data"]
items_to_return = [
    {"borrow_order_item_id": bo_detail["items"][0]["id"], "asset_id": bo_detail["items"][0]["asset_id"], "condition": "GOOD"},
    {"borrow_order_item_id": bo_detail["items"][1]["id"], "asset_id": bo_detail["items"][1]["asset_id"], "condition": "DAMAGED", "damage_description": "screen cracked"},
]
r = httpx.post(f"{base}/return-orders", json={"borrow_order_id": bo_id, "items": items_to_return, "remark": "partial"}, headers=h)
assert r.status_code == 200, f"Return submit failed: {r.text}"
ro = r.json()["data"]
ro_id = ro["id"]
print(f"6. Return order: {ro['order_no']} status={ro['status']} items={ro['item_count']} tasks={len(ro['approval_tasks'])}")

# 7. Approve return task
rt_task_id = ro["approval_tasks"][0]["id"]
r = httpx.post(f"{base}/return-approval-tasks/{rt_task_id}/approve", json={"comment": "ok"}, headers=h)
assert r.status_code == 200, f"Return approve failed: {r.text}"
print(f"7. Return task approved: {r.json()['data']['status']}")

# 8. Check return order status -> COMPLETED
r = httpx.get(f"{base}/return-orders/{ro_id}", headers=h)
ro_status = r.json()["data"]["status"]
print(f"8. Return order status: {ro_status}")
assert ro_status == "COMPLETED"

# 9. Check borrow order status -> PARTIALLY_RETURNED
r = httpx.get(f"{base}/borrow-orders/{bo_id}", headers=h)
bo_status2 = r.json()["data"]["status"]
print(f"9. Borrow order status after partial return: {bo_status2}")
assert bo_status2 == "PARTIALLY_RETURNED"

# 10. Return last item (FULL_LOSS)
items_to_return2 = [
    {"borrow_order_item_id": bo_detail["items"][2]["id"], "asset_id": bo_detail["items"][2]["asset_id"], "condition": "FULL_LOSS"},
]
r = httpx.post(f"{base}/return-orders", json={"borrow_order_id": bo_id, "items": items_to_return2}, headers=h)
assert r.status_code == 200, f"Return2 submit failed: {r.text}"
ro2 = r.json()["data"]
rt2_task_id = ro2["approval_tasks"][0]["id"]
print(f"10. Return order 2: {ro2['order_no']}")

# 11. Approve second return
r = httpx.post(f"{base}/return-approval-tasks/{rt2_task_id}/approve", json={}, headers=h)
assert r.status_code == 200

# 12. Borrow order should now be COMPLETED
r = httpx.get(f"{base}/borrow-orders/{bo_id}", headers=h)
bo_final = r.json()["data"]["status"]
print(f"11-12. Borrow order final status: {bo_final}")
assert bo_final == "COMPLETED"

print("\n=== Phase 3 E2E test PASSED ===")

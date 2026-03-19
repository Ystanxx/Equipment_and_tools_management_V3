def test_approve_registration(client, auth_headers):
    reg_res = client.post("/api/v1/auth/register", json={
        "username": "newuser", "email": "new@b.com", "password": "pass", "full_name": "New",
    })
    assert reg_res.status_code == 200

    list_res = client.get("/api/v1/registration-requests", params={"status": "PENDING"}, headers=auth_headers)
    assert list_res.status_code == 200
    items = list_res.json()["data"]["items"]
    assert len(items) >= 1

    req_id = items[0]["id"]
    approve_res = client.post(f"/api/v1/registration-requests/{req_id}/approve", headers=auth_headers)
    assert approve_res.status_code == 200
    assert approve_res.json()["data"]["status"] == "APPROVED"


def test_reject_registration(client, auth_headers):
    client.post("/api/v1/auth/register", json={
        "username": "rejectme", "email": "rej@b.com", "password": "pass", "full_name": "Reject",
    })
    list_res = client.get("/api/v1/registration-requests", params={"status": "PENDING"}, headers=auth_headers)
    req_id = list_res.json()["data"]["items"][0]["id"]

    reject_res = client.post(f"/api/v1/registration-requests/{req_id}/reject",
                              json={"reason": "not qualified"},
                              headers=auth_headers)
    assert reject_res.status_code == 200
    assert reject_res.json()["data"]["status"] == "REJECTED"

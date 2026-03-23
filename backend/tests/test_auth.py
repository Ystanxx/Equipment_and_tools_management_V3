from datetime import datetime, timedelta, timezone

from app.core.security import decode_access_token


def test_register_success(client):
    res = client.post("/api/v1/auth/register", json={
        "username": "testuser",
        "email": "test@example.com",
        "password": "password123",
        "full_name": "Test User",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["code"] == 0
    assert data["data"]["username"] == "testuser"
    assert data["data"]["status"] == "PENDING"


def test_register_duplicate_username(client):
    payload = {"username": "dup", "email": "a@b.com", "password": "pass", "full_name": "Dup"}
    client.post("/api/v1/auth/register", json=payload)
    res = client.post("/api/v1/auth/register", json={**payload, "email": "c@d.com"})
    assert res.status_code == 409


def test_login_pending_user(client):
    client.post("/api/v1/auth/register", json={
        "username": "pending", "email": "p@p.com", "password": "pass", "full_name": "Pending",
    })
    res = client.post("/api/v1/auth/login", json={"username": "pending", "password": "pass"})
    assert res.status_code == 200
    token = res.json()["data"]["access_token"]
    me_res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.json()["data"]["status"] == "PENDING"


def test_login_wrong_password(client):
    client.post("/api/v1/auth/register", json={
        "username": "user2", "email": "u2@b.com", "password": "correct", "full_name": "U2",
    })
    res = client.post("/api/v1/auth/login", json={"username": "user2", "password": "wrong"})
    assert res.status_code == 401
    assert "用户名或密码错误" in res.json()["detail"]


def test_login_remember_me_extends_expiry(client):
    client.post("/api/v1/auth/register", json={
        "username": "remember_user", "email": "remember@test.com", "password": "correct", "full_name": "Remember",
    })
    res = client.post("/api/v1/auth/login", json={
        "username": "remember_user",
        "password": "correct",
        "remember_me": True,
    })
    assert res.status_code == 200

    payload = decode_access_token(res.json()["data"]["access_token"])
    expire_at = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    assert expire_at - datetime.now(timezone.utc) > timedelta(days=29)

"""Tests for the password change API endpoint."""
from tests.conftest import TestSession
from app.models.user import User
from app.utils.enums import UserRole, UserStatus


def _create_user(client, username="pwduser"):
    client.post("/api/v1/auth/register", json={
        "username": username,
        "email": f"{username}@test.com",
        "password": "oldpass123",
        "full_name": "Pwd User",
    })
    session = TestSession()
    user = session.query(User).filter(User.username == username).first()
    user.role = UserRole.USER
    user.status = UserStatus.ACTIVE
    session.commit()
    session.close()
    res = client.post("/api/v1/auth/login", json={"username": username, "password": "oldpass123"})
    return res.json()["data"]["access_token"]


def test_change_password_success(client):
    token = _create_user(client)
    headers = {"Authorization": f"Bearer {token}"}

    res = client.put("/api/v1/auth/password", json={
        "old_password": "oldpass123",
        "new_password": "newpass456",
    }, headers=headers)
    assert res.status_code == 200
    assert "成功" in res.json()["message"]

    # Login with new password should work
    res = client.post("/api/v1/auth/login", json={"username": "pwduser", "password": "newpass456"})
    assert res.status_code == 200

    # Login with old password should fail
    res = client.post("/api/v1/auth/login", json={"username": "pwduser", "password": "oldpass123"})
    assert res.status_code == 401


def test_change_password_wrong_old(client):
    token = _create_user(client, "pwduser2")
    headers = {"Authorization": f"Bearer {token}"}

    res = client.put("/api/v1/auth/password", json={
        "old_password": "wrongpass",
        "new_password": "newpass456",
    }, headers=headers)
    assert res.status_code == 400
    assert "原密码" in res.json()["detail"]


def test_change_password_too_short(client):
    token = _create_user(client, "pwduser3")
    headers = {"Authorization": f"Bearer {token}"}

    res = client.put("/api/v1/auth/password", json={
        "old_password": "oldpass123",
        "new_password": "abc",
    }, headers=headers)
    assert res.status_code == 400
    assert "6" in res.json()["detail"]

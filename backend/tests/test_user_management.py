import pytest

from fastapi import HTTPException

from app.models.user import User
from app.services import user_service
from app.utils.enums import UserRole, UserStatus


def _make_user(db, username: str, role: UserRole, status: UserStatus = UserStatus.ACTIVE) -> User:
    user = User(
        username=username,
        email=f"{username}@test.com",
        hashed_password="hashed",
        full_name=username,
        role=role,
        status=status,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _login_as_role(client, db, username: str, role: UserRole, user_status: UserStatus = UserStatus.ACTIVE):
    password = "testpass123"
    client.post("/api/v1/auth/register", json={
        "username": username,
        "email": f"{username}@test.com",
        "password": password,
        "full_name": username,
    })
    user = db.query(User).filter(User.username == username).first()
    user.role = role
    user.status = user_status
    db.commit()

    res = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    token = res.json()["data"]["access_token"]
    return user, {"Authorization": f"Bearer {token}"}


def test_super_admin_can_promote_user_to_super_admin(client, db):
    _, super_headers = _login_as_role(client, db, "promote_super", UserRole.SUPER_ADMIN)
    target_user, _ = _login_as_role(client, db, "promote_target", UserRole.USER)

    res = client.put(
        f"/api/v1/users/{target_user.id}/role",
        json={"role": "SUPER_ADMIN"},
        headers=super_headers,
    )

    assert res.status_code == 200
    assert res.json()["data"]["role"] == "SUPER_ADMIN"


def test_super_admin_can_update_user_profile(client, db):
    operator, super_headers = _login_as_role(client, db, "profile_super", UserRole.SUPER_ADMIN)
    target_user, _ = _login_as_role(client, db, "profile_target", UserRole.USER)

    res = client.put(
        f"/api/v1/users/{target_user.id}/profile",
        json={
            "username": "updated_target",
            "full_name": "更新后的姓名",
            "email": "updated_target@test.com",
        },
        headers=super_headers,
    )

    assert res.status_code == 200
    payload = res.json()["data"]
    assert payload["username"] == "updated_target"
    assert payload["full_name"] == "更新后的姓名"
    assert payload["email"] == "updated_target@test.com"

    operator_res = client.put(
        f"/api/v1/users/{operator.id}/profile",
        json={
            "username": "profile_super_renamed",
            "full_name": "新的超管姓名",
            "email": "profile_super_renamed@test.com",
        },
        headers=super_headers,
    )

    assert operator_res.status_code == 200
    operator_payload = operator_res.json()["data"]
    assert operator_payload["username"] == "profile_super_renamed"
    assert operator_payload["full_name"] == "新的超管姓名"
    assert operator_payload["email"] == "profile_super_renamed@test.com"


def test_super_admin_cannot_update_user_profile_to_duplicate_username_or_email(client, db):
    _, super_headers = _login_as_role(client, db, "dup_profile_super", UserRole.SUPER_ADMIN)
    target_user, _ = _login_as_role(client, db, "dup_profile_target", UserRole.USER)
    existing_user, _ = _login_as_role(client, db, "dup_profile_existing", UserRole.USER)

    username_conflict = client.put(
        f"/api/v1/users/{target_user.id}/profile",
        json={
            "username": existing_user.username,
            "full_name": "重复用户名",
            "email": "dup_username@test.com",
        },
        headers=super_headers,
    )
    assert username_conflict.status_code == 400
    assert username_conflict.json()["detail"] == "用户名已存在"

    email_conflict = client.put(
        f"/api/v1/users/{target_user.id}/profile",
        json={
            "username": "dup_profile_unique",
            "full_name": "重复邮箱",
            "email": existing_user.email,
        },
        headers=super_headers,
    )
    assert email_conflict.status_code == 400
    assert email_conflict.json()["detail"] == "邮箱已存在"


def test_service_cannot_downgrade_last_super_admin(db):
    operator = _make_user(db, "role_operator", UserRole.USER)
    target = _make_user(db, "role_target", UserRole.SUPER_ADMIN)

    with pytest.raises(HTTPException) as exc:
        user_service.update_user_role(db, target.id, UserRole.USER, operator)
    assert exc.value.status_code == 400
    assert exc.value.detail == "不能降级最后一个超级管理员"

    db.refresh(target)
    assert target.role == UserRole.SUPER_ADMIN


def test_service_cannot_disable_last_active_super_admin(db):
    operator = _make_user(db, "status_operator", UserRole.USER)
    target = _make_user(db, "status_target", UserRole.SUPER_ADMIN)

    with pytest.raises(HTTPException) as exc:
        user_service.update_user_status(db, target.id, UserStatus.DISABLED, operator)
    assert exc.value.status_code == 400
    assert exc.value.detail == "不能停用最后一个超级管理员"

    db.refresh(target)
    assert target.status == UserStatus.ACTIVE


def test_service_cannot_downgrade_last_active_super_admin_when_only_disabled_super_remains(db):
    operator = _make_user(db, "role_operator_active", UserRole.USER)
    target = _make_user(db, "role_target_active", UserRole.SUPER_ADMIN, UserStatus.ACTIVE)
    _make_user(db, "role_target_disabled", UserRole.SUPER_ADMIN, UserStatus.DISABLED)

    with pytest.raises(HTTPException) as exc:
        user_service.update_user_role(db, target.id, UserRole.ASSET_ADMIN, operator)
    assert exc.value.status_code == 400
    assert exc.value.detail == "不能降级最后一个超级管理员"

    db.refresh(target)
    assert target.role == UserRole.SUPER_ADMIN

from unittest.mock import MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.main import seed_super_admin
from app.models.user import User
from app.utils.enums import UserRole, UserStatus


def _build_session(existing=None, commit_side_effect=None, existing_after_rollback=None):
    session = MagicMock()
    query = session.query.return_value
    filtered = query.filter.return_value
    if commit_side_effect is None:
        filtered.first.return_value = existing
    else:
        filtered.first.side_effect = [existing, existing_after_rollback]
        session.commit.side_effect = commit_side_effect
    return session


def test_seed_super_admin_creates_admin_when_missing(monkeypatch):
    session = _build_session(existing=None)
    monkeypatch.setattr("app.main.SessionLocal", lambda: session)

    seed_super_admin()

    session.add.assert_called_once()
    created_user = session.add.call_args.args[0]
    assert isinstance(created_user, User)
    assert created_user.username == "admin"
    assert created_user.email == "admin@example.com"
    assert created_user.role == UserRole.SUPER_ADMIN
    assert created_user.status == UserStatus.ACTIVE
    session.commit.assert_called_once()
    session.rollback.assert_not_called()
    session.close.assert_called_once()


def test_seed_super_admin_uses_username_and_email_for_lookup(monkeypatch):
    session = _build_session(existing=User(username="admin", email="admin@example.com", hashed_password="hashed", full_name="管理员", role=UserRole.SUPER_ADMIN, status=UserStatus.ACTIVE))
    monkeypatch.setattr("app.main.SessionLocal", lambda: session)

    seed_super_admin()

    lookup_expr = session.query.return_value.filter.call_args.args[0]
    lookup_sql = str(lookup_expr)
    assert "users.username" in lookup_sql
    assert "users.email" in lookup_sql
    assert " OR " in lookup_sql
    session.add.assert_not_called()
    session.commit.assert_not_called()
    session.close.assert_called_once()


def test_seed_super_admin_rolls_back_when_commit_hits_duplicate(monkeypatch):
    existing_after_rollback = User(
        username="existing_admin",
        email="admin@example.com",
        hashed_password="hashed",
        full_name="现有管理员",
        role=UserRole.SUPER_ADMIN,
        status=UserStatus.ACTIVE,
    )
    session = _build_session(
        existing=None,
        commit_side_effect=IntegrityError("insert into users", {}, Exception("duplicate key")),
        existing_after_rollback=existing_after_rollback,
    )
    monkeypatch.setattr("app.main.SessionLocal", lambda: session)

    seed_super_admin()

    session.add.assert_called_once()
    session.commit.assert_called_once()
    session.rollback.assert_called_once()
    assert session.query.return_value.filter.return_value.first.call_count == 2
    session.close.assert_called_once()


def test_seed_super_admin_rolls_back_and_reraises_other_commit_errors(monkeypatch):
    session = _build_session(existing=None)
    session.commit.side_effect = RuntimeError("db write failed")
    monkeypatch.setattr("app.main.SessionLocal", lambda: session)

    with pytest.raises(RuntimeError, match="db write failed"):
        seed_super_admin()

    session.rollback.assert_called_once()
    session.close.assert_called_once()

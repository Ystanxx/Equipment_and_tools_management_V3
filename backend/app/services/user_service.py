import uuid

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.user import User
from app.utils.enums import UserRole, UserStatus
from app.services import audit_service


def _count_super_admins(db: Session) -> int:
    return db.query(User).filter(User.role == UserRole.SUPER_ADMIN).count()


def _count_active_super_admins(db: Session) -> int:
    return db.query(User).filter(
        User.role == UserRole.SUPER_ADMIN,
        User.status == UserStatus.ACTIVE,
    ).count()


def list_users(
    db: Session,
    role_filter: UserRole | None = None,
    status_filter: UserStatus | None = None,
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[User], int]:
    query = db.query(User)
    if role_filter:
        query = query.filter(User.role == role_filter)
    if status_filter:
        query = query.filter(User.status == status_filter)
    if keyword:
        like = f"%{keyword}%"
        query = query.filter(
            (User.username.ilike(like)) | (User.full_name.ilike(like)) | (User.email.ilike(like))
        )
    query = query.order_by(User.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return items, total


def get_user(db: Session, user_id: uuid.UUID) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    return user


def _ensure_unique_username_email(db: Session, user_id: uuid.UUID, username: str, email: str) -> None:
    username_exists = (
        db.query(User)
        .filter(User.username == username, User.id != user_id)
        .first()
    )
    if username_exists:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="用户名已存在")

    email_exists = (
        db.query(User)
        .filter(User.email == email, User.id != user_id)
        .first()
    )
    if email_exists:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="邮箱已存在")


def update_user_role(db: Session, user_id: uuid.UUID, new_role: UserRole, operator: User) -> User:
    if user_id == operator.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能修改自己的角色")
    user = get_user(db, user_id)
    if user.role == UserRole.SUPER_ADMIN and new_role != UserRole.SUPER_ADMIN:
        if _count_super_admins(db) <= 1 or (user.status == UserStatus.ACTIVE and _count_active_super_admins(db) <= 1):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能降级最后一个超级管理员")
    user.role = new_role
    audit_service.log(
        db,
        operator.id,
        "USER_ROLE_UPDATE",
        "User",
        user.id,
        description=f"将用户 {user.username} 角色修改为 {new_role.value}",
    )
    db.commit()
    db.refresh(user)
    return user


def update_user_status(db: Session, user_id: uuid.UUID, new_status: UserStatus, operator: User) -> User:
    if user_id == operator.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能修改自己的状态")
    user = get_user(db, user_id)
    if (
        user.role == UserRole.SUPER_ADMIN
        and user.status == UserStatus.ACTIVE
        and new_status != UserStatus.ACTIVE
        and _count_active_super_admins(db) <= 1
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能停用最后一个超级管理员")
    user.status = new_status
    audit_service.log(
        db,
        operator.id,
        "USER_STATUS_UPDATE",
        "User",
        user.id,
        description=f"将用户 {user.username} 状态修改为 {new_status.value}",
    )
    db.commit()
    db.refresh(user)
    return user


def update_email_notification_preference(db: Session, user: User, enabled: bool) -> User:
    user.email_notifications_enabled = enabled
    audit_service.log(
        db,
        user.id,
        "USER_EMAIL_NOTIFICATION_UPDATE",
        "User",
        user.id,
        description=f"用户 {user.username} 将邮件通知设置为 {'开启' if enabled else '关闭'}",
        snapshot={"email_notifications_enabled": enabled},
    )
    db.commit()
    db.refresh(user)
    return user


def update_user_profile(
    db: Session,
    user_id: uuid.UUID,
    username: str,
    full_name: str,
    email: str,
    operator: User,
) -> User:
    user = get_user(db, user_id)

    normalized_username = (username or "").strip()
    normalized_full_name = (full_name or "").strip()
    normalized_email = (email or "").strip().lower()

    if not normalized_username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="用户名不能为空")
    if not normalized_full_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="姓名不能为空")
    if not normalized_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="邮箱不能为空")

    _ensure_unique_username_email(db, user_id, normalized_username, normalized_email)

    user.username = normalized_username
    user.full_name = normalized_full_name
    user.email = normalized_email
    audit_service.log(
        db,
        operator.id,
        "USER_PROFILE_UPDATE",
        "User",
        user.id,
        description=f"更新用户 {user.username} 的基础资料",
        snapshot={
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
        },
    )
    db.commit()
    db.refresh(user)
    return user

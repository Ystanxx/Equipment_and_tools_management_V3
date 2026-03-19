import uuid

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.user import User
from app.utils.enums import UserRole, UserStatus


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


def update_user_role(db: Session, user_id: uuid.UUID, new_role: UserRole, operator: User) -> User:
    if user_id == operator.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能修改自己的角色")
    user = get_user(db, user_id)
    if new_role == UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能设置超级管理员角色")
    user.role = new_role
    db.commit()
    db.refresh(user)
    return user


def update_user_status(db: Session, user_id: uuid.UUID, new_status: UserStatus, operator: User) -> User:
    if user_id == operator.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能修改自己的状态")
    user = get_user(db, user_id)
    user.status = new_status
    db.commit()
    db.refresh(user)
    return user

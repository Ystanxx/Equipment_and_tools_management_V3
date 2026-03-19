import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_super_admin
from app.models.user import User
from app.schemas.user import UserOut, RoleUpdateRequest, StatusUpdateRequest
from app.schemas.common import ResponseSchema, PaginatedData
from app.services import user_service
from app.utils.enums import UserRole, UserStatus

router = APIRouter(prefix="/users", tags=["用户管理"])


@router.get("", response_model=ResponseSchema[PaginatedData[UserOut]])
def list_users(
    role: UserRole | None = None,
    status: UserStatus | None = None,
    keyword: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    items, total = user_service.list_users(db, role, status, keyword, page, page_size)
    data = PaginatedData(
        items=[UserOut.model_validate(u) for u in items],
        total=total,
        page=page,
        page_size=page_size,
    )
    return ResponseSchema(data=data)


@router.get("/{user_id}", response_model=ResponseSchema[UserOut])
def get_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    user = user_service.get_user(db, user_id)
    return ResponseSchema(data=UserOut.model_validate(user))


@router.put("/{user_id}/role", response_model=ResponseSchema[UserOut])
def update_role(
    user_id: uuid.UUID,
    body: RoleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    user = user_service.update_user_role(db, user_id, body.role, current_user)
    return ResponseSchema(data=UserOut.model_validate(user), message="角色已更新")


@router.put("/{user_id}/status", response_model=ResponseSchema[UserOut])
def update_status(
    user_id: uuid.UUID,
    body: StatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    user = user_service.update_user_status(db, user_id, body.status, current_user)
    return ResponseSchema(data=UserOut.model_validate(user), message="状态已更新")

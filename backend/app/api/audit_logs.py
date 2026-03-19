from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_role
from app.models.user import User
from app.schemas.audit_log import AuditLogOut
from app.schemas.common import ResponseSchema, PaginatedData
from app.services import audit_service
from app.utils.enums import UserRole

router = APIRouter(prefix="/audit-logs", tags=["审计日志"])


@router.get("", summary="审计日志列表")
def list_logs(
    page: int = 1,
    page_size: int = 50,
    action: str | None = None,
    target_type: str | None = None,
    order_id: UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN)),
):
    items, total = audit_service.list_logs(
        db=db,
        action=action,
        target_type=target_type,
        order_id=order_id,
        page=page,
        page_size=page_size,
    )
    out = [
        AuditLogOut(
            id=l.id,
            actor_id=l.actor_id,
            action=l.action,
            target_type=l.target_type,
            target_id=l.target_id,
            order_id=l.order_id,
            description=l.description,
            snapshot=l.snapshot,
            created_at=l.created_at,
        )
        for l in items
    ]
    return ResponseSchema(data=PaginatedData(items=out, total=total, page=page, page_size=page_size))

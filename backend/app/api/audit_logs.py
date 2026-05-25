from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_active_user, require_role
from app.models.user import User
from app.models.borrow_order import BorrowOrder
from app.models.return_order import ReturnOrder
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
    out = [AuditLogOut.model_validate(l) for l in items]
    return ResponseSchema(data=PaginatedData(items=out, total=total, page=page, page_size=page_size))


@router.get("/order-timeline/{order_id}", summary="订单事件时间线")
def order_timeline(
    order_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    """Return audit logs for a specific order. Accessible to the order applicant or admins."""
    is_admin = user.role in (UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN)
    if not is_admin:
        bo = db.query(BorrowOrder).filter(BorrowOrder.id == order_id).first()
        ro = db.query(ReturnOrder).filter(ReturnOrder.id == order_id).first()
        if not ((bo and bo.applicant_id == user.id) or (ro and ro.applicant_id == user.id)):
            raise HTTPException(status_code=403, detail="无权查看该订单时间线")

    items, _ = audit_service.list_logs(db=db, order_id=order_id, page=1, page_size=100)
    items.reverse()  # chronological order (oldest first)
    out = [AuditLogOut.model_validate(l) for l in items]
    return ResponseSchema(data=out)

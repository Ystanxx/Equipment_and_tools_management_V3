from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_role
from app.models.user import User
from app.schemas.borrow_order import BorrowApprovalTaskOut, ApprovalActionRequest
from app.schemas.common import ResponseSchema, PaginatedData
from app.services import borrow_approval_service
from app.utils.enums import UserRole

router = APIRouter(prefix="/borrow-approval-tasks", tags=["借出审批"])


def _task_to_out(t) -> BorrowApprovalTaskOut:
    return BorrowApprovalTaskOut(
        id=t.id,
        order_id=t.order_id,
        approver_id=t.approver_id,
        approver_name=t.approver.full_name if t.approver else None,
        item_ids=t.item_ids or [],
        status=t.status.value if hasattr(t.status, "value") else t.status,
        comment=t.comment,
        decided_at=t.decided_at,
        created_at=t.created_at,
    )


@router.get("", summary="审批任务列表")
def list_tasks(
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    order_id: UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN)),
):
    # 设备管理员只看自己的任务，超管看全部
    approver_id = user.id if user.role == UserRole.ASSET_ADMIN else None
    items, total = borrow_approval_service.list_pending_tasks(
        db=db,
        approver_id=approver_id,
        order_id=order_id,
        status_filter=status,
        page=page,
        page_size=page_size,
    )
    return ResponseSchema(
        data=PaginatedData(
            items=[_task_to_out(t) for t in items],
            total=total,
            page=page,
            page_size=page_size,
        )
    )


@router.post("/{task_id}/approve", summary="通过审批")
def approve(
    task_id: UUID,
    body: ApprovalActionRequest = ApprovalActionRequest(),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN)),
):
    task = borrow_approval_service.approve_task(db, task_id, user, body.comment)
    return ResponseSchema(data=_task_to_out(task))


@router.post("/{task_id}/reject", summary="驳回审批")
def reject(
    task_id: UUID,
    body: ApprovalActionRequest = ApprovalActionRequest(),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN)),
):
    task = borrow_approval_service.reject_task(db, task_id, user, body.comment)
    return ResponseSchema(data=_task_to_out(task))

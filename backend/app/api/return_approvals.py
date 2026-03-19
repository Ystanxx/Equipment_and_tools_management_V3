from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_role
from app.models.user import User
from app.schemas.return_order import ReturnApprovalTaskOut, ReturnApprovalActionRequest
from app.schemas.common import ResponseSchema, PaginatedData
from app.services import return_approval_service
from app.utils.enums import UserRole

router = APIRouter(prefix="/return-approval-tasks", tags=["归还审批"])


def _task_to_out(t) -> ReturnApprovalTaskOut:
    return ReturnApprovalTaskOut(
        id=t.id,
        return_order_id=t.return_order_id,
        approver_id=t.approver_id,
        approver_name=t.approver.full_name if t.approver else None,
        item_ids=t.item_ids or [],
        status=t.status.value if hasattr(t.status, "value") else t.status,
        comment=t.comment,
        decided_at=t.decided_at,
        created_at=t.created_at,
    )


@router.get("", summary="归还审批任务列表")
def list_tasks(
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    return_order_id: UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN)),
):
    approver_id = user.id if user.role == UserRole.ASSET_ADMIN else None
    items, total = return_approval_service.list_return_tasks(
        db=db,
        approver_id=approver_id,
        return_order_id=return_order_id,
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


@router.post("/{task_id}/approve", summary="通过归还审批")
def approve(
    task_id: UUID,
    body: ReturnApprovalActionRequest = ReturnApprovalActionRequest(),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN)),
):
    task = return_approval_service.approve_return_task(db, task_id, user, body.comment)
    return ResponseSchema(data=_task_to_out(task))


@router.post("/{task_id}/reject", summary="驳回归还审批")
def reject(
    task_id: UUID,
    body: ReturnApprovalActionRequest = ReturnApprovalActionRequest(),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN)),
):
    task = return_approval_service.reject_return_task(db, task_id, user, body.comment)
    return ResponseSchema(data=_task_to_out(task))

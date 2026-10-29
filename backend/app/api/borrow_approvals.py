from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, lazyload, joinedload

from app.core.deps import get_db, require_role
from app.models.user import User
from app.models.borrow_order import BorrowOrder
from app.models.borrow_order_item import BorrowOrderItem
from app.schemas.borrow_order import BorrowApprovalTaskOut, ApprovalActionRequest, ApprovalItemDetail
from app.schemas.common import ResponseSchema, PaginatedData
from app.services import borrow_approval_service
from app.utils.enums import UserRole

router = APIRouter(prefix="/borrow-approval-tasks", tags=["借出审批"])


def _load_context(tasks, db):
    ids = {item_id for task in tasks for item_id in task.item_ids or []}
    orders = {o.id: o for o in db.query(BorrowOrder).options(
        lazyload("*"), joinedload(BorrowOrder.applicant)).filter(
        BorrowOrder.id.in_({t.order_id for t in tasks})).all()} if tasks else {}
    items = {i.id: i for i in db.query(BorrowOrderItem).options(lazyload("*")).filter(
        BorrowOrderItem.id.in_(ids)).all()} if ids else {}
    return orders, items


def _task_to_out(t, db: Session = None, context=None) -> BorrowApprovalTaskOut:
    item_details = []
    order_no = None
    applicant_name = None
    equipment_order_id = None
    if db:
        orders, item_map = context if context is not None else _load_context([t], db)
        items = [item_map[item_id] for item_id in t.item_ids or [] if item_id in item_map]
        item_details = [
            ApprovalItemDetail(
                id=i.id, asset_id=i.asset_id,
                asset_code_snapshot=i.asset_code_snapshot,
                asset_name_snapshot=i.asset_name_snapshot,
                location_name_snapshot=i.location_name_snapshot,
            ) for i in items
        ]
        order = orders.get(t.order_id)
        if order:
            order_no = order.order_no
            applicant_name = order.applicant.full_name if order.applicant else None
            equipment_order_id = order.equipment_order_id
    return BorrowApprovalTaskOut(
        id=t.id,
        order_id=t.order_id,
        equipment_order_id=equipment_order_id,
        order_no=order_no,
        applicant_name=applicant_name,
        approver_id=t.approver_id,
        approver_name=t.approver.full_name if t.approver else None,
        item_ids=t.item_ids or [],
        item_details=item_details,
        status=t.status.value if hasattr(t.status, "value") else t.status,
        comment=t.comment,
        decided_at=t.decided_at,
        created_at=t.created_at,
    )


@router.get("", summary="审批任务列表")
def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    history_only: bool = False,
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
        history_only=history_only,
        page=page,
        page_size=page_size,
    )
    context = _load_context(items, db)
    return ResponseSchema(
        data=PaginatedData(
            items=[_task_to_out(t, db, context) for t in items],
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
    return ResponseSchema(data=_task_to_out(task, db))


@router.post("/{task_id}/reject", summary="驳回审批")
def reject(
    task_id: UUID,
    body: ApprovalActionRequest = ApprovalActionRequest(),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN)),
):
    task = borrow_approval_service.reject_task(db, task_id, user, body.comment)
    return ResponseSchema(data=_task_to_out(task, db))

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.asset import Asset
from app.models.borrow_order import BorrowOrder
from app.models.borrow_approval_task import BorrowApprovalTask
from app.models.user import User
from app.utils.enums import (
    ApprovalTaskStatus,
    AssetStatus,
    BorrowOrderStatus,
    UserRole,
)
from app.services import audit_service


def list_pending_tasks(
    db: Session,
    approver_id: uuid.UUID | None = None,
    order_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[BorrowApprovalTask], int]:
    q = db.query(BorrowApprovalTask)
    if approver_id:
        q = q.filter(BorrowApprovalTask.approver_id == approver_id)
    if order_id:
        q = q.filter(BorrowApprovalTask.order_id == order_id)
    if status_filter:
        q = q.filter(BorrowApprovalTask.status == status_filter)
    total = q.count()
    items = q.order_by(BorrowApprovalTask.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return items, total


def approve_task(db: Session, task_id: uuid.UUID, user: User, comment: str | None = None) -> BorrowApprovalTask:
    task = _get_task_for_user(db, task_id, user)

    task.status = ApprovalTaskStatus.APPROVED
    task.comment = comment
    task.decided_at = datetime.now(timezone.utc)

    _sync_order_status(db, task.order_id)

    audit_service.log(db, user.id, "BORROW_TASK_APPROVE", "BorrowApprovalTask", task.id, task.order_id, f"通过借出审批，{len(task.item_ids)} 件")
    db.commit()
    db.refresh(task)
    return task


def reject_task(db: Session, task_id: uuid.UUID, user: User, comment: str | None = None) -> BorrowApprovalTask:
    task = _get_task_for_user(db, task_id, user)

    task.status = ApprovalTaskStatus.REJECTED
    task.comment = comment
    task.decided_at = datetime.now(timezone.utc)

    # 驳回 → 相关设备恢复在库
    for item_id in task.item_ids:
        from app.models.borrow_order_item import BorrowOrderItem
        item = db.query(BorrowOrderItem).filter(BorrowOrderItem.id == item_id).first()
        if item:
            asset = db.query(Asset).filter(Asset.id == item.asset_id).first()
            if asset and asset.status == AssetStatus.PENDING_BORROW_APPROVAL:
                asset.status = AssetStatus.IN_STOCK

    _sync_order_status(db, task.order_id)

    audit_service.log(db, user.id, "BORROW_TASK_REJECT", "BorrowApprovalTask", task.id, task.order_id, f"驳回借出审批，{len(task.item_ids)} 件")
    db.commit()
    db.refresh(task)
    return task


def _get_task_for_user(db: Session, task_id: uuid.UUID, user: User) -> BorrowApprovalTask:
    task = db.query(BorrowApprovalTask).filter(BorrowApprovalTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="审批任务不存在")
    if task.status != ApprovalTaskStatus.PENDING:
        raise HTTPException(status_code=400, detail="该任务已处理")

    # 权限：必须是任务指定的审批人，或超管可兜底
    if task.approver_id != user.id and user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="无权处理该审批任务")

    return task


def _sync_order_status(db: Session, order_id: uuid.UUID):
    """根据所有审批任务状态同步借用单状态"""
    order = db.query(BorrowOrder).filter(BorrowOrder.id == order_id).first()
    if not order:
        return

    tasks = db.query(BorrowApprovalTask).filter(BorrowApprovalTask.order_id == order_id).all()
    statuses = [t.status for t in tasks]

    if all(s == ApprovalTaskStatus.APPROVED for s in statuses):
        # 全部通过 → READY_FOR_PICKUP
        order.status = BorrowOrderStatus.READY_FOR_PICKUP
    elif any(s == ApprovalTaskStatus.REJECTED for s in statuses):
        # 有驳回 → REJECTED
        order.status = BorrowOrderStatus.REJECTED
    elif any(s == ApprovalTaskStatus.APPROVED for s in statuses) and any(s == ApprovalTaskStatus.PENDING for s in statuses):
        # 部分通过部分待审 → PARTIALLY_APPROVED
        order.status = BorrowOrderStatus.PARTIALLY_APPROVED
    # 其他情况保持 PENDING_APPROVAL

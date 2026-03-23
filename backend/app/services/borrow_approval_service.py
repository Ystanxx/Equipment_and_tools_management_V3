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
from app.services import audit_service, equipment_order_service, notification_service


def list_pending_tasks(
    db: Session,
    approver_id: uuid.UUID | None = None,
    order_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    history_only: bool = False,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[BorrowApprovalTask], int]:
    q = db.query(BorrowApprovalTask)
    if approver_id:
        q = q.filter(BorrowApprovalTask.approver_id == approver_id)
    if order_id:
        q = q.filter(BorrowApprovalTask.order_id == order_id)
    if history_only:
        q = q.filter(BorrowApprovalTask.status != ApprovalTaskStatus.PENDING)
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

    order = db.query(BorrowOrder).filter(BorrowOrder.id == task.order_id).first()
    equipment_order_service.sync_from_borrow_order(db, task.order_id)
    audit_service.log(
        db,
        user.id,
        "BORROW_TASK_APPROVE",
        "BorrowApprovalTask",
        task.id,
        equipment_order_id=order.equipment_order_id if order else None,
        order_id=task.order_id,
        description=f"通过借出审批，{len(task.item_ids)} 件",
    )

    # 通知借用人审批进度
    if order:
        if order.status == BorrowOrderStatus.READY_FOR_PICKUP:
            notification_service.create(
                db,
                recipient_id=order.applicant_id,
                title="借用单已全部通过",
                content=f"您的借用单 {order.order_no} 已全部审批通过，请前往领取设备。",
                notification_type="BORROW",
                related_type="BorrowOrder",
                related_id=order.id,
            )
        else:
            notification_service.create(
                db,
                recipient_id=order.applicant_id,
                title="借用审批部分通过",
                content=f"您的借用单 {order.order_no} 有 {len(task.item_ids)} 件设备审批通过。",
                notification_type="BORROW",
                related_type="BorrowOrder",
                related_id=order.id,
            )

    db.commit()
    db.refresh(task)
    return task


def reject_task(db: Session, task_id: uuid.UUID, user: User, comment: str | None = None) -> BorrowApprovalTask:
    task = _get_task_for_user(db, task_id, user)

    task.status = ApprovalTaskStatus.REJECTED
    task.comment = comment
    task.decided_at = datetime.now(timezone.utc)

    # 驳回后，整张借用单不再继续审批，其余待处理任务跳过，相关设备统一回到在库。
    from app.models.borrow_order_item import BorrowOrderItem

    sibling_tasks = db.query(BorrowApprovalTask).filter(BorrowApprovalTask.order_id == task.order_id).all()
    for sibling in sibling_tasks:
        if sibling.id != task.id and sibling.status == ApprovalTaskStatus.PENDING:
            sibling.status = ApprovalTaskStatus.SKIPPED

    order_items = db.query(BorrowOrderItem).filter(BorrowOrderItem.order_id == task.order_id).all()
    for item in order_items:
        asset = db.query(Asset).filter(Asset.id == item.asset_id).first()
        if asset and asset.status == AssetStatus.PENDING_BORROW_APPROVAL:
            asset.status = AssetStatus.IN_STOCK

    _sync_order_status(db, task.order_id)

    order = db.query(BorrowOrder).filter(BorrowOrder.id == task.order_id).first()
    equipment_order_service.sync_from_borrow_order(db, task.order_id)
    audit_service.log(
        db,
        user.id,
        "BORROW_TASK_REJECT",
        "BorrowApprovalTask",
        task.id,
        equipment_order_id=order.equipment_order_id if order else None,
        order_id=task.order_id,
        description=f"驳回借出审批，{len(task.item_ids)} 件",
    )

    # 通知借用人驳回
    if order:
        comment_text = f"审批意见：{comment}" if comment else ""
        notification_service.create(
            db,
            recipient_id=order.applicant_id,
            title="借用单已被驳回",
            content=f"您的借用单 {order.order_no} 已被驳回。{comment_text}",
            notification_type="BORROW",
            related_type="BorrowOrder",
            related_id=order.id,
        )

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

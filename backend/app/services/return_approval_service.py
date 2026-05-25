import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.asset import Asset
from app.models.borrow_order import BorrowOrder
from app.models.return_order import ReturnOrder
from app.models.return_order_item import ReturnOrderItem
from app.models.return_approval_task import ReturnApprovalTask
from app.models.user import User
from app.utils.enums import (
    ApprovalTaskStatus,
    AssetStatus,
    BorrowOrderStatus,
    ReturnOrderStatus,
    ReturnItemCondition,
    UserRole,
)
from app.services import audit_service, notification_service


def list_return_tasks(
    db: Session,
    approver_id: uuid.UUID | None = None,
    return_order_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[ReturnApprovalTask], int]:
    q = db.query(ReturnApprovalTask)
    if approver_id:
        q = q.filter(ReturnApprovalTask.approver_id == approver_id)
    if return_order_id:
        q = q.filter(ReturnApprovalTask.return_order_id == return_order_id)
    if status_filter:
        q = q.filter(ReturnApprovalTask.status == status_filter)
    total = q.count()
    items = q.order_by(ReturnApprovalTask.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return items, total


def approve_return_task(
    db: Session, task_id: uuid.UUID, user: User, comment: str | None = None
) -> ReturnApprovalTask:
    task = _get_task_for_user(db, task_id, user)

    task.status = ApprovalTaskStatus.APPROVED
    task.comment = comment
    task.decided_at = datetime.now(timezone.utc)

    audit_service.log(db, user.id, "RETURN_TASK_APPROVE", "ReturnApprovalTask", task.id, task.return_order_id, f"通过归还审批，{len(task.item_ids)} 件")

    has_loss_or_damage = False
    # 根据各明细的 condition 更新设备状态
    for item_id in task.item_ids:
        ri = db.query(ReturnOrderItem).filter(ReturnOrderItem.id == item_id).first()
        if not ri:
            continue
        asset = db.query(Asset).filter(Asset.id == ri.asset_id).first()
        if not asset:
            continue

        if ri.condition == ReturnItemCondition.GOOD:
            asset.status = AssetStatus.IN_STOCK
        elif ri.condition in (ReturnItemCondition.FULL_LOSS, ReturnItemCondition.PARTIAL_LOSS):
            asset.status = AssetStatus.LOST
            has_loss_or_damage = True
        elif ri.condition == ReturnItemCondition.DAMAGED:
            asset.status = AssetStatus.DAMAGED
            has_loss_or_damage = True

    _sync_return_order_status(db, task.return_order_id)

    # 通知归还人审批结果
    ro = db.query(ReturnOrder).filter(ReturnOrder.id == task.return_order_id).first()
    if ro:
        notification_service.create(
            db,
            recipient_id=ro.applicant_id,
            title="归还审批已通过",
            content=f"您的归还单 {ro.order_no} 有 {len(task.item_ids)} 件设备审批通过。",
            notification_type="RETURN",
            related_type="ReturnOrder",
            related_id=ro.id,
        )

    # 丢失/损坏 → 通知超管
    if has_loss_or_damage and ro:
        notification_service.notify_all_super_admins(
            db,
            title="归还单存在丢失或损坏",
            content=f"归还单 {ro.order_no} 中存在设备丢失或损坏，需要关注处理。",
            notification_type="RETURN",
            related_type="ReturnOrder",
            related_id=ro.id,
        )

    db.commit()
    db.refresh(task)
    return task


def reject_return_task(
    db: Session, task_id: uuid.UUID, user: User, comment: str | None = None
) -> ReturnApprovalTask:
    task = _get_task_for_user(db, task_id, user)

    task.status = ApprovalTaskStatus.REJECTED
    task.comment = comment
    task.decided_at = datetime.now(timezone.utc)

    audit_service.log(db, user.id, "RETURN_TASK_REJECT", "ReturnApprovalTask", task.id, task.return_order_id, f"驳回归还审批，{len(task.item_ids)} 件")

    # 通知归还人驳回
    ro = db.query(ReturnOrder).filter(ReturnOrder.id == task.return_order_id).first()
    if ro:
        comment_text = f"审批意见：{comment}" if comment else ""
        notification_service.create(
            db,
            recipient_id=ro.applicant_id,
            title="归还审批已被驳回",
            content=f"您的归还单 {ro.order_no} 已被驳回。{comment_text}",
            notification_type="RETURN",
            related_type="ReturnOrder",
            related_id=ro.id,
        )

    # 驳回 → 恢复设备到 BORROWED
    for item_id in task.item_ids:
        ri = db.query(ReturnOrderItem).filter(ReturnOrderItem.id == item_id).first()
        if ri:
            asset = db.query(Asset).filter(Asset.id == ri.asset_id).first()
            if asset and asset.status == AssetStatus.PENDING_RETURN_APPROVAL:
                asset.status = AssetStatus.BORROWED

    _sync_return_order_status(db, task.return_order_id)

    db.commit()
    db.refresh(task)
    return task


def _get_task_for_user(db: Session, task_id: uuid.UUID, user: User) -> ReturnApprovalTask:
    task = db.query(ReturnApprovalTask).filter(ReturnApprovalTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="归还审批任务不存在")
    if task.status != ApprovalTaskStatus.PENDING:
        raise HTTPException(status_code=400, detail="该任务已处理")
    if task.approver_id != user.id and user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="无权处理该审批任务")
    return task


def _sync_return_order_status(db: Session, return_order_id: uuid.UUID):
    """根据所有审批任务状态同步归还单和借用单状态"""
    ro = db.query(ReturnOrder).filter(ReturnOrder.id == return_order_id).first()
    if not ro:
        return

    tasks = db.query(ReturnApprovalTask).filter(ReturnApprovalTask.return_order_id == return_order_id).all()
    statuses = [t.status for t in tasks]

    if all(s == ApprovalTaskStatus.APPROVED for s in statuses):
        ro.status = ReturnOrderStatus.COMPLETED
        db.flush()  # ensure COMPLETED status is visible to subsequent queries
        _sync_borrow_order_after_return(db, ro.borrow_order_id)
    elif any(s == ApprovalTaskStatus.REJECTED for s in statuses):
        ro.status = ReturnOrderStatus.REJECTED
    elif any(s == ApprovalTaskStatus.APPROVED for s in statuses) and any(s == ApprovalTaskStatus.PENDING for s in statuses):
        ro.status = ReturnOrderStatus.PARTIALLY_APPROVED


def _sync_borrow_order_after_return(db: Session, borrow_order_id: uuid.UUID):
    """归还审批完成后，检查借用单是否所有设备都已归还"""
    from app.models.borrow_order_item import BorrowOrderItem

    bo = db.query(BorrowOrder).filter(BorrowOrder.id == borrow_order_id).first()
    if not bo:
        return

    total_items = db.query(BorrowOrderItem).filter(BorrowOrderItem.order_id == borrow_order_id).count()

    # 统计已完成归还的设备数
    returned_count = (
        db.query(ReturnOrderItem.asset_id)
        .join(ReturnOrder, ReturnOrder.id == ReturnOrderItem.return_order_id)
        .filter(
            ReturnOrder.borrow_order_id == borrow_order_id,
            ReturnOrder.status == ReturnOrderStatus.COMPLETED,
        )
        .distinct()
        .count()
    )

    if returned_count >= total_items:
        bo.status = BorrowOrderStatus.COMPLETED
    elif returned_count > 0:
        bo.status = BorrowOrderStatus.PARTIALLY_RETURNED

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import and_, case, cast, func, or_, select, String
from sqlalchemy.orm import Session, joinedload, lazyload, selectinload

from app.models.audit_log import AuditLog
from app.models.borrow_order import BorrowOrder
from app.models.borrow_order_item import BorrowOrderItem
from app.models.borrow_approval_task import BorrowApprovalTask
from app.models.equipment_order import EquipmentOrder
from app.models.return_order import ReturnOrder
from app.models.return_order_item import ReturnOrderItem
from app.models.return_approval_task import ReturnApprovalTask
from app.utils.enums import BorrowOrderStatus, EquipmentOrderStatus, ReturnOrderStatus


def create_equipment_order(
    db: Session,
    order_no: str,
    applicant_id: uuid.UUID,
    purpose: str | None,
    expected_return_date: str | None,
    item_count: int,
    remark: str | None,
) -> EquipmentOrder:
    order = EquipmentOrder(
        order_no=order_no,
        applicant_id=applicant_id,
        status=EquipmentOrderStatus.PENDING_BORROW_APPROVAL,
        purpose=purpose,
        expected_return_date=expected_return_date,
        item_count=item_count,
        remark=remark,
    )
    db.add(order)
    db.flush()
    return order


def get_equipment_order(db: Session, equipment_order_id: uuid.UUID) -> EquipmentOrder | None:
    return db.query(EquipmentOrder).filter(EquipmentOrder.id == equipment_order_id).first()


def require_equipment_order(db: Session, equipment_order_id: uuid.UUID) -> EquipmentOrder:
    order = get_equipment_order(db, equipment_order_id)
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    return order


def list_equipment_orders(
    db: Session,
    applicant_id: uuid.UUID | None = None,
    status_group: str | None = None,
    page: int = 1,
    page_size: int = 20,
    viewer=None,
) -> tuple[list[EquipmentOrder], int]:
    q = db.query(EquipmentOrder)
    if viewer is not None:
        from app.services.access_service import equipment_order_scope
        q = q.filter(equipment_order_scope(viewer))
    if applicant_id:
        q = q.filter(EquipmentOrder.applicant_id == applicant_id)
    group = (status_group or "").upper()
    if group in {"IN_PROGRESS", "COMPLETED"}:
        q = q.outerjoin(BorrowOrder, BorrowOrder.equipment_order_id == EquipmentOrder.id)
        # Match the display resolver: completed returns count distinct assets,
        # including legacy batches. Approved returns are still in progress.
        completed = select(func.count(func.distinct(ReturnOrderItem.asset_id))).join(
            ReturnOrder, ReturnOrder.id == ReturnOrderItem.return_order_id
        ).where(ReturnOrder.equipment_order_id == EquipmentOrder.id,
                ReturnOrder.status == ReturnOrderStatus.COMPLETED).correlate(EquipmentOrder).scalar_subquery()
        item_count = func.coalesce(func.nullif(EquipmentOrder.item_count, 0), BorrowOrder.item_count, 0)
        display_group = case(
            (BorrowOrder.id.is_(None), cast(EquipmentOrder.status, String)),
            (BorrowOrder.status == BorrowOrderStatus.REJECTED, "BORROW_REJECTED"),
            (BorrowOrder.status == BorrowOrderStatus.CANCELLED, "CANCELLED"),
            (BorrowOrder.status.in_([BorrowOrderStatus.PENDING_APPROVAL, BorrowOrderStatus.PARTIALLY_APPROVED,
                                   BorrowOrderStatus.APPROVED, BorrowOrderStatus.READY_FOR_PICKUP]), "IN_PROGRESS"),
            (or_(BorrowOrder.status == BorrowOrderStatus.COMPLETED,
                 and_(item_count > 0, completed >= item_count)), "COMPLETED"),
            else_="IN_PROGRESS",
        )
        if group == "COMPLETED":
            q = q.filter(display_group == "COMPLETED")
        else:
            q = q.filter(display_group.in_(["IN_PROGRESS", "PENDING_BORROW_APPROVAL", "READY_FOR_PICKUP",
                "BORROWED", "PENDING_RETURN_APPROVAL", "RETURN_REJECTED", "PARTIALLY_RETURNED"]))
    total = q.count()
    orders = q.options(
        lazyload("*"), joinedload(EquipmentOrder.applicant),
        selectinload(EquipmentOrder.borrow_order).lazyload("*"),
        selectinload(EquipmentOrder.return_orders).options(
            lazyload("*"), selectinload(ReturnOrder.items).lazyload("*")),
    ).order_by(EquipmentOrder.created_at.desc(), EquipmentOrder.id.desc()).offset(
        max(0, (page - 1) * page_size)).limit(page_size).all()
    return orders, total


def list_order_timeline(db: Session, equipment_order_id: uuid.UUID) -> list[AuditLog]:
    return (
        db.query(AuditLog)
        .filter(AuditLog.equipment_order_id == equipment_order_id)
        .order_by(AuditLog.created_at.asc())
        .all()
    )


def list_order_items(db: Session, borrow_order_id: uuid.UUID) -> list[BorrowOrderItem]:
    return db.query(BorrowOrderItem).filter(BorrowOrderItem.order_id == borrow_order_id).all()


def list_borrow_approval_tasks(db: Session, borrow_order_id: uuid.UUID) -> list[BorrowApprovalTask]:
    return db.query(BorrowApprovalTask).filter(BorrowApprovalTask.order_id == borrow_order_id).all()


def list_return_approval_tasks(db: Session, return_order_id: uuid.UUID) -> list[ReturnApprovalTask]:
    return db.query(ReturnApprovalTask).filter(ReturnApprovalTask.return_order_id == return_order_id).all()


def _collect_return_progress(order: EquipmentOrder) -> tuple[int, int, int, bool]:
    completed_assets: set[uuid.UUID] = set()
    approved_assets: set[uuid.UUID] = set()
    pending_assets: set[uuid.UUID] = set()
    has_rejected_batch = False

    for return_order in order.return_orders or []:
        asset_ids = {item.asset_id for item in return_order.items or []}
        if return_order.status == ReturnOrderStatus.COMPLETED:
            completed_assets.update(asset_ids)
        elif return_order.status == ReturnOrderStatus.APPROVED:
            approved_assets.update(asset_ids)
        elif return_order.status in (ReturnOrderStatus.PENDING_APPROVAL, ReturnOrderStatus.PARTIALLY_APPROVED):
            pending_assets.update(asset_ids)
        elif return_order.status == ReturnOrderStatus.REJECTED:
            has_rejected_batch = True

    approved_assets -= completed_assets
    pending_assets -= completed_assets
    pending_assets -= approved_assets

    return len(completed_assets), len(approved_assets), len(pending_assets), has_rejected_batch


def resolve_equipment_order_status(order: EquipmentOrder) -> str:
    """为统一订单提供前端展示状态。"""
    borrow_order = order.borrow_order
    if not borrow_order:
        raw_status = order.status
        return raw_status.value if hasattr(raw_status, "value") else raw_status

    if borrow_order.status in (BorrowOrderStatus.PENDING_APPROVAL, BorrowOrderStatus.PARTIALLY_APPROVED, BorrowOrderStatus.APPROVED):
        return EquipmentOrderStatus.PENDING_BORROW_APPROVAL.value
    if borrow_order.status == BorrowOrderStatus.REJECTED:
        return EquipmentOrderStatus.BORROW_REJECTED.value
    if borrow_order.status == BorrowOrderStatus.READY_FOR_PICKUP:
        return EquipmentOrderStatus.READY_FOR_PICKUP.value
    if borrow_order.status == BorrowOrderStatus.CANCELLED:
        return EquipmentOrderStatus.CANCELLED.value

    completed_count, approved_count, pending_count, has_rejected_batch = _collect_return_progress(order)
    total_items = order.item_count or borrow_order.item_count or 0

    if borrow_order.status == BorrowOrderStatus.COMPLETED or (total_items and completed_count >= total_items):
        return EquipmentOrderStatus.COMPLETED.value
    if total_items and approved_count > 0 and completed_count + approved_count >= total_items:
        return "PENDING_STOCK_IN"
    if pending_count > 0:
        return EquipmentOrderStatus.PENDING_RETURN_APPROVAL.value
    if approved_count > 0 or completed_count > 0 or borrow_order.status == BorrowOrderStatus.PARTIALLY_RETURNED:
        return EquipmentOrderStatus.PARTIALLY_RETURNED.value
    if has_rejected_batch:
        return EquipmentOrderStatus.RETURN_REJECTED.value
    if borrow_order.status == BorrowOrderStatus.DELIVERED:
        return EquipmentOrderStatus.BORROWED.value

    raw_status = order.status
    return raw_status.value if hasattr(raw_status, "value") else raw_status


def sync_from_borrow_order(db: Session, borrow_order_id: uuid.UUID) -> EquipmentOrder | None:
    borrow_order = db.query(BorrowOrder).filter(BorrowOrder.id == borrow_order_id).first()
    if not borrow_order:
        return None

    equipment_order = borrow_order.equipment_order
    if not equipment_order:
        return None

    status = borrow_order.status
    if status in (BorrowOrderStatus.PENDING_APPROVAL, BorrowOrderStatus.PARTIALLY_APPROVED, BorrowOrderStatus.APPROVED):
        equipment_order.status = EquipmentOrderStatus.PENDING_BORROW_APPROVAL
    elif status == BorrowOrderStatus.REJECTED:
        equipment_order.status = EquipmentOrderStatus.BORROW_REJECTED
    elif status == BorrowOrderStatus.READY_FOR_PICKUP:
        equipment_order.status = EquipmentOrderStatus.READY_FOR_PICKUP
    elif status == BorrowOrderStatus.DELIVERED:
        equipment_order.status = EquipmentOrderStatus.BORROWED
    elif status == BorrowOrderStatus.PARTIALLY_RETURNED:
        equipment_order.status = EquipmentOrderStatus.PARTIALLY_RETURNED
    elif status == BorrowOrderStatus.COMPLETED:
        equipment_order.status = EquipmentOrderStatus.COMPLETED
        equipment_order.completed_at = equipment_order.completed_at or datetime.now(timezone.utc)
    elif status == BorrowOrderStatus.CANCELLED:
        equipment_order.status = EquipmentOrderStatus.CANCELLED

    equipment_order.delivered_at = borrow_order.delivered_at
    equipment_order.delivered_by = borrow_order.delivered_by
    equipment_order.updated_at = datetime.now(timezone.utc)
    return equipment_order


def sync_after_return_order(db: Session, return_order_id: uuid.UUID) -> EquipmentOrder | None:
    return_order = db.query(ReturnOrder).filter(ReturnOrder.id == return_order_id).first()
    if not return_order:
        return None

    equipment_order = return_order.equipment_order
    if not equipment_order:
        return None

    status = return_order.status
    if status in (ReturnOrderStatus.PENDING_APPROVAL, ReturnOrderStatus.PARTIALLY_APPROVED, ReturnOrderStatus.APPROVED):
        equipment_order.status = EquipmentOrderStatus.PARTIALLY_RETURNED if status == ReturnOrderStatus.APPROVED else EquipmentOrderStatus.PENDING_RETURN_APPROVAL
    elif status == ReturnOrderStatus.REJECTED:
        equipment_order.status = EquipmentOrderStatus.RETURN_REJECTED
    elif status == ReturnOrderStatus.COMPLETED:
        borrow_order = return_order.borrow_order
        if borrow_order.status == BorrowOrderStatus.COMPLETED:
            equipment_order.status = EquipmentOrderStatus.COMPLETED
            equipment_order.completed_at = equipment_order.completed_at or datetime.now(timezone.utc)
        elif borrow_order.status == BorrowOrderStatus.PARTIALLY_RETURNED:
            equipment_order.status = EquipmentOrderStatus.PARTIALLY_RETURNED
        else:
            equipment_order.status = EquipmentOrderStatus.BORROWED

    equipment_order.updated_at = datetime.now(timezone.utc)
    return equipment_order

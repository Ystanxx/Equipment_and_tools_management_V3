import uuid
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.asset import Asset
from app.models.borrow_order import BorrowOrder
from app.models.borrow_order_item import BorrowOrderItem
from app.models.return_order import ReturnOrder
from app.models.return_order_item import ReturnOrderItem
from app.models.return_approval_task import ReturnApprovalTask
from app.models.user import User
from app.utils.enums import (
    AssetStatus,
    BorrowOrderStatus,
    ReturnOrderStatus,
    ReturnItemCondition,
    ApprovalTaskStatus,
    UserRole,
)
from app.services import audit_service, equipment_order_service, notification_service, attachment_service


def _generate_return_order_no(db: Session) -> str:
    """生成归还单号: RO-YYYYMMDD-XXXX"""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = f"RO-{today}-"
    db.execute(text("SELECT pg_advisory_xact_lock(81476002)"))
    last = (
        db.query(ReturnOrder)
        .filter(ReturnOrder.order_no.like(f"{prefix}%"))
        .order_by(ReturnOrder.order_no.desc())
        .first()
    )
    if last:
        seq = int(last.order_no.split("-")[-1]) + 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


RETURN_CONDITION_LABELS = {
    ReturnItemCondition.GOOD: "完好",
    ReturnItemCondition.PARTIAL_LOSS: "部分丢失",
    ReturnItemCondition.FULL_LOSS: "全部丢失",
    ReturnItemCondition.DAMAGED: "损坏",
}


def _format_return_items_for_notification(items: list[ReturnOrderItem]) -> str:
    return "、".join(
        f"{item.asset_name_snapshot}（{item.asset_code_snapshot}，{RETURN_CONDITION_LABELS.get(item.condition, item.condition.value)}）"
        for item in items
    )


def _get_already_returned_asset_ids(db: Session, borrow_order_id: uuid.UUID) -> set[uuid.UUID]:
    """查找该借用单下所有已提交归还（非取消）的 asset_id"""
    existing = (
        db.query(ReturnOrderItem.asset_id)
        .join(ReturnOrder, ReturnOrder.id == ReturnOrderItem.return_order_id)
        .filter(
            ReturnOrder.borrow_order_id == borrow_order_id,
            ReturnOrder.status != ReturnOrderStatus.REJECTED,
        )
        .all()
    )
    return {row[0] for row in existing}


def sync_borrow_order_after_return(db: Session, borrow_order_id: uuid.UUID):
    """根据归还批次进度同步借用单状态。"""
    borrow_order = db.query(BorrowOrder).filter(BorrowOrder.id == borrow_order_id).first()
    if not borrow_order:
        return

    total_items = db.query(BorrowOrderItem).filter(BorrowOrderItem.order_id == borrow_order_id).count()
    if total_items == 0:
        return

    completed_count = (
        db.query(ReturnOrderItem.asset_id)
        .join(ReturnOrder, ReturnOrder.id == ReturnOrderItem.return_order_id)
        .filter(
            ReturnOrder.borrow_order_id == borrow_order_id,
            ReturnOrder.status == ReturnOrderStatus.COMPLETED,
        )
        .distinct()
        .count()
    )
    approved_count = (
        db.query(ReturnOrderItem.asset_id)
        .join(ReturnOrder, ReturnOrder.id == ReturnOrderItem.return_order_id)
        .filter(
            ReturnOrder.borrow_order_id == borrow_order_id,
            ReturnOrder.status == ReturnOrderStatus.APPROVED,
        )
        .distinct()
        .count()
    )
    pending_count = (
        db.query(ReturnOrderItem.asset_id)
        .join(ReturnOrder, ReturnOrder.id == ReturnOrderItem.return_order_id)
        .filter(
            ReturnOrder.borrow_order_id == borrow_order_id,
            ReturnOrder.status.in_([ReturnOrderStatus.PENDING_APPROVAL, ReturnOrderStatus.PARTIALLY_APPROVED]),
        )
        .distinct()
        .count()
    )

    if completed_count >= total_items:
        borrow_order.status = BorrowOrderStatus.COMPLETED
    elif completed_count > 0 or approved_count > 0 or pending_count > 0:
        borrow_order.status = BorrowOrderStatus.PARTIALLY_RETURNED
    else:
        borrow_order.status = BorrowOrderStatus.DELIVERED
    db.flush()


def create_return_order(
    db: Session,
    applicant: User,
    borrow_order_id: uuid.UUID,
    items_input: list[dict],
    remark: str | None = None,
    submission_id: uuid.UUID | None = None,
) -> ReturnOrder:
    created_files = []
    try:
        return _create_return_order(db, applicant, borrow_order_id, items_input, remark, submission_id, created_files)
    except Exception:
        db.rollback()
        for path in created_files:
            path.unlink(missing_ok=True)
        raise


def _create_return_order(db, applicant, borrow_order_id, items_input, remark, submission_id, created_files):
    borrow_order = db.query(BorrowOrder).filter(BorrowOrder.id == borrow_order_id).with_for_update(of=BorrowOrder).populate_existing().first()
    if not borrow_order:
        raise HTTPException(status_code=404, detail="借用单不存在")
    if borrow_order.applicant_id != applicant.id:
        raise HTTPException(status_code=403, detail="只能归还自己的借用单")
    if submission_id:
        existing = db.query(ReturnOrder).filter(ReturnOrder.submission_id == submission_id).first()
        if existing:
            if existing.applicant_id != applicant.id or existing.borrow_order_id != borrow_order_id:
                raise HTTPException(status_code=409, detail="提交标识已使用，请重新打开归还页面")
            return existing
    if borrow_order.status not in (BorrowOrderStatus.DELIVERED, BorrowOrderStatus.PARTIALLY_RETURNED):
        raise HTTPException(status_code=400, detail=f"借用单状态 {borrow_order.status.value} 不可归还")
    if submission_id and any(not item.get('staged_photo_tokens') for item in items_input):
        raise HTTPException(status_code=400, detail="请为每件归还设备上传照片")

    already_returned = _get_already_returned_asset_ids(db, borrow_order_id)
    item_ids = [item['borrow_order_item_id'] for item in items_input]
    if len(item_ids) != len(set(item_ids)):
        raise HTTPException(status_code=400, detail="归还清单存在重复设备")
    tokens = [str(t) for item in items_input for t in (item.get('staged_photo_tokens') or [])]
    if len(tokens) != len(set(tokens)):
        raise HTTPException(status_code=400, detail="同一张照片不能重复用于不同明细")

    # 校验明细
    borrow_item_map: dict[uuid.UUID, BorrowOrderItem] = {
        bi.id: bi for bi in borrow_order.items
    }

    order_no = _generate_return_order_no(db)
    return_order = ReturnOrder(
        equipment_order_id=borrow_order.equipment_order_id,
        order_no=order_no,
        borrow_order_id=borrow_order_id,
        applicant_id=applicant.id,
        status=ReturnOrderStatus.PENDING_APPROVAL,
        item_count=len(items_input),
        remark=remark,
        submission_id=submission_id,
    )
    db.add(return_order)
    db.flush()

    admin_items: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
    return_items_by_id: dict[uuid.UUID, ReturnOrderItem] = {}

    for inp in items_input:
        bi = borrow_item_map.get(inp["borrow_order_item_id"])
        if not bi:
            raise HTTPException(status_code=400, detail=f"明细 {inp['borrow_order_item_id']} 不属于该借用单")
        if bi.asset_id in already_returned:
            raise HTTPException(status_code=400, detail=f"设备 {bi.asset_code_snapshot} 已在其他归还单中")
        if inp['asset_id'] != bi.asset_id:
            raise HTTPException(status_code=400, detail="设备与借用明细不匹配")

        condition = ReturnItemCondition(inp["condition"])
        damage_type_val = inp.get("damage_type")
        damage_desc = inp.get("damage_description")

        ri = ReturnOrderItem(
            return_order_id=return_order.id,
            asset_id=bi.asset_id,
            borrow_order_item_id=bi.id,
            asset_code_snapshot=bi.asset_code_snapshot,
            asset_name_snapshot=bi.asset_name_snapshot,
            admin_id_snapshot=bi.admin_id_snapshot,
            admin_name_snapshot=bi.admin_name_snapshot,
            condition=condition,
            damage_type=damage_type_val,
            damage_description=damage_desc,
        )
        db.add(ri)
        db.flush()
        for token in inp.get('staged_photo_tokens') or []:
            attachment_service.finalize_staged_attachment(
                db, stage_token=str(token), related_type='ReturnOrderItem', related_id=ri.id,
                user=applicant, commit=False, created_files=created_files,
            )
        return_items_by_id[ri.id] = ri
        admin_items[bi.admin_id_snapshot].append(ri.id)

        # 设备状态 → 待归还审核
        asset = db.query(Asset).filter(Asset.id == bi.asset_id).first()
        if asset:
            asset.status = AssetStatus.PENDING_RETURN_APPROVAL

    # 按管理员拆分审批任务
    for approver_id, item_id_list in admin_items.items():
        task = ReturnApprovalTask(
            return_order_id=return_order.id,
            approver_id=approver_id,
            item_ids=item_id_list,
            status=ApprovalTaskStatus.PENDING,
        )
        db.add(task)

    equipment_order_service.sync_after_return_order(db, return_order.id)
    audit_service.log(
        db,
        applicant.id,
        "RETURN_ORDER_CREATE",
        "ReturnOrder",
        return_order.id,
        equipment_order_id=borrow_order.equipment_order_id,
        order_id=return_order.id,
        description=f"提交归还单 {order_no}，共 {len(items_input)} 件",
    )

    # 通知各管理员有新归还审批
    for approver_id, item_ids in admin_items.items():
        item_text = _format_return_items_for_notification(
            [return_items_by_id[item_id] for item_id in item_ids if item_id in return_items_by_id]
        )
        notification_service.create(
            db,
            recipient_id=approver_id,
            title="归还待审核",
            content=f"{applicant.full_name} 申请归还 {item_text}。单号：{order_no}，请及时审批。",
            notification_type="RETURN",
            related_type="ReturnOrder",
            related_id=return_order.id,
        )

    db.commit()
    # Once committed, a later refresh/cleanup failure must not delete persisted photos.
    created_files.clear()
    db.refresh(return_order)
    for token in tokens:
        try:
            attachment_service._cleanup_staged_attachment(token)
        except OSError:
            attachment_service.logger.warning("临时照片清理失败，将由定时任务重试")
    return return_order


def stock_in_return_order(db: Session, return_order_id: uuid.UUID, operator: User) -> ReturnOrder:
    """归还审批完成后，管理员确认入库。"""
    db.query(ReturnOrder).filter(ReturnOrder.id == return_order_id).with_for_update(of=ReturnOrder).populate_existing().first()
    order = get_return_order(db, return_order_id)

    if not user_can_manage_return_order(order, operator):
        raise HTTPException(status_code=403, detail="只能确认自己负责设备的入库")

    if order.status != ReturnOrderStatus.APPROVED:
        raise HTTPException(status_code=400, detail=f"归还单状态 {order.status.value} 不可确认入库")

    has_loss_or_damage = False
    pending_items = pending_stock_in_items(order, operator)
    if not pending_items:
        raise HTTPException(status_code=400, detail="您负责的设备已确认入库，请等待其他管理员")
    for item in pending_items:
        item.stocked_in_at = datetime.now(timezone.utc)
        item.stocked_in_by = operator.id
        asset = db.query(Asset).filter(Asset.id == item.asset_id).first()
        if not asset:
            continue

        if item.condition == ReturnItemCondition.GOOD:
            asset.status = AssetStatus.IN_STOCK
        elif item.condition in (ReturnItemCondition.FULL_LOSS, ReturnItemCondition.PARTIAL_LOSS):
            asset.status = AssetStatus.LOST
            has_loss_or_damage = True
        elif item.condition == ReturnItemCondition.DAMAGED:
            asset.status = AssetStatus.DAMAGED
            has_loss_or_damage = True

    if all(item.stocked_in_at for item in order.items):
        order.status = ReturnOrderStatus.COMPLETED
    order.updated_at = datetime.now(timezone.utc)
    db.flush()
    sync_borrow_order_after_return(db, order.borrow_order_id)
    equipment_order_service.sync_after_return_order(db, order.id)

    audit_service.log(
        db,
        operator.id,
        "RETURN_ORDER_STOCK_IN",
        "ReturnOrder",
        order.id,
        equipment_order_id=order.equipment_order_id,
        order_id=order.id,
        description=f"已入库归还单 {order.order_no}，本次 {len(pending_items)} 件",
    )

    notification_service.create(
        db,
        recipient_id=order.applicant_id,
        title="归还单已完成入库" if order.status == ReturnOrderStatus.COMPLETED else "归还单部分入库",
        content=f"您的归还单 {order.order_no} 已入库 {sum(bool(i.stocked_in_at) for i in order.items)}/{order.item_count} 件，订单状态已更新。",
        notification_type="RETURN",
        related_type="ReturnOrder",
        related_id=order.id,
    )

    if has_loss_or_damage:
        notification_service.notify_all_super_admins(
            db,
            title="归还入库包含异常器材",
            content=f"归还单 {order.order_no} 入库时存在损坏或丢失器材，请及时跟进。",
            notification_type="RETURN",
            related_type="ReturnOrder",
            related_id=order.id,
        )

    db.commit()
    db.refresh(order)
    return order


def get_return_order(db: Session, order_id: uuid.UUID) -> ReturnOrder:
    order = db.query(ReturnOrder).filter(ReturnOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="归还单不存在")
    return order


def user_can_access_return_order(order: ReturnOrder, user: User) -> bool:
    """判断当前用户是否有权查看该归还单。"""
    if user.role == UserRole.SUPER_ADMIN:
        return True
    if order.applicant_id == user.id:
        return True
    if user.role != UserRole.ASSET_ADMIN:
        return False
    return any(item.admin_id_snapshot == user.id for item in (order.items or []))


def user_can_manage_return_order(order: ReturnOrder, user: User) -> bool:
    """判断当前用户是否有权执行归还单管理动作。"""
    if user.role == UserRole.SUPER_ADMIN:
        return True
    if user.role != UserRole.ASSET_ADMIN:
        return False
    items = order.items or []
    return any(item.admin_id_snapshot == user.id for item in items)


def pending_stock_in_items(order: ReturnOrder, user: User) -> list[ReturnOrderItem]:
    if user.role not in (UserRole.SUPER_ADMIN, UserRole.ASSET_ADMIN) or order.status != ReturnOrderStatus.APPROVED:
        return []
    return [item for item in order.items if not item.stocked_in_at and
            (user.role == UserRole.SUPER_ADMIN or item.admin_id_snapshot == user.id)]


def list_return_orders(
    db: Session,
    applicant_id: uuid.UUID | None = None,
    managed_admin_id: uuid.UUID | None = None,
    borrow_order_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    page: int = 1,
    page_size: int = 20,
    viewer=None,
) -> tuple[list[ReturnOrder], int]:
    q = db.query(ReturnOrder)
    if viewer is not None:
        from sqlalchemy import select
        from app.models.equipment_order import EquipmentOrder
        from app.services.access_service import equipment_order_scope
        q = q.filter(ReturnOrder.equipment_order_id.in_(select(EquipmentOrder.id).where(equipment_order_scope(viewer))))
    if applicant_id:
        q = q.filter(ReturnOrder.applicant_id == applicant_id)
    if managed_admin_id:
        q = q.join(ReturnOrderItem, ReturnOrderItem.return_order_id == ReturnOrder.id).filter(
            ReturnOrderItem.admin_id_snapshot == managed_admin_id
        ).distinct()
    if borrow_order_id:
        q = q.filter(ReturnOrder.borrow_order_id == borrow_order_id)
    if status_filter:
        q = q.filter(ReturnOrder.status == status_filter)
    total = q.count()
    items = q.order_by(ReturnOrder.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return items, total

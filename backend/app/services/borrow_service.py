import uuid
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.asset import Asset
from app.models.borrow_order import BorrowOrder
from app.models.borrow_order_item import BorrowOrderItem
from app.models.borrow_approval_task import BorrowApprovalTask
from app.models.user import User
from app.utils.enums import AssetStatus, BorrowOrderStatus, ApprovalTaskStatus
from app.services import audit_service, system_config_service


def _generate_order_no(db: Session) -> str:
    """生成借用单号: BO-YYYYMMDD-XXXX"""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = f"BO-{today}-"
    last = (
        db.query(BorrowOrder)
        .filter(BorrowOrder.order_no.like(f"{prefix}%"))
        .order_by(BorrowOrder.order_no.desc())
        .first()
    )
    if last:
        seq = int(last.order_no.split("-")[-1]) + 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


def create_borrow_order(
    db: Session,
    applicant: User,
    asset_ids: list[uuid.UUID],
    purpose: str | None = None,
    expected_return_date: str | None = None,
    remark: str | None = None,
) -> BorrowOrder:
    max_items = int(system_config_service.get_config_value(db, "borrow_order_max_items"))
    require_purpose = bool(system_config_service.get_config_value(db, "require_borrow_purpose"))
    require_expected_return_time = bool(system_config_service.get_config_value(db, "require_expected_return_time"))

    if len(asset_ids) > max_items:
        raise HTTPException(status_code=400, detail=f"一次最多借出 {max_items} 件")
    if len(set(asset_ids)) != len(asset_ids):
        raise HTTPException(status_code=400, detail="存在重复设备")
    if require_purpose and not (purpose or "").strip():
        raise HTTPException(status_code=400, detail="当前系统要求必须填写借用用途")
    if require_expected_return_time and not expected_return_date:
        raise HTTPException(status_code=400, detail="当前系统要求必须填写预计归还时间")

    # 查询并锁定设备
    assets = db.query(Asset).filter(Asset.id.in_(asset_ids)).all()
    if len(assets) != len(asset_ids):
        raise HTTPException(status_code=404, detail="部分设备不存在")

    for a in assets:
        if a.status != AssetStatus.IN_STOCK:
            raise HTTPException(status_code=400, detail=f"设备 {a.asset_code} 当前状态不是在库，无法借出")
        if not a.is_active:
            raise HTTPException(status_code=400, detail=f"设备 {a.asset_code} 已停用")

    order_no = _generate_order_no(db)
    order = BorrowOrder(
        order_no=order_no,
        applicant_id=applicant.id,
        status=BorrowOrderStatus.PENDING_APPROVAL,
        purpose=purpose,
        expected_return_date=expected_return_date,
        item_count=len(assets),
        remark=remark,
    )
    db.add(order)
    db.flush()  # 获取 order.id

    # 创建明细 + 按管理员分组
    admin_items: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
    for a in assets:
        loc_name = a.location.name if a.location else None
        admin_name = a.admin.full_name if a.admin else ""
        item = BorrowOrderItem(
            order_id=order.id,
            asset_id=a.id,
            asset_code_snapshot=a.asset_code,
            asset_name_snapshot=a.name,
            admin_id_snapshot=a.admin_id,
            admin_name_snapshot=admin_name,
            location_name_snapshot=loc_name,
        )
        db.add(item)
        db.flush()
        admin_items[a.admin_id].append(item.id)

        # 设备状态 → 待借出审核
        a.status = AssetStatus.PENDING_BORROW_APPROVAL

    # 按管理员拆分审批任务
    for approver_id, item_id_list in admin_items.items():
        task = BorrowApprovalTask(
            order_id=order.id,
            approver_id=approver_id,
            item_ids=item_id_list,
            status=ApprovalTaskStatus.PENDING,
        )
        db.add(task)

    audit_service.log(db, applicant.id, "BORROW_ORDER_CREATE", "BorrowOrder", order.id, order.id, f"提交借用单 {order_no}，共 {len(assets)} 件")
    db.commit()
    db.refresh(order)
    return order


def get_borrow_order(db: Session, order_id: uuid.UUID) -> BorrowOrder:
    order = db.query(BorrowOrder).filter(BorrowOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="借用单不存在")
    return order


def list_borrow_orders(
    db: Session,
    applicant_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[BorrowOrder], int]:
    q = db.query(BorrowOrder)
    if applicant_id:
        q = q.filter(BorrowOrder.applicant_id == applicant_id)
    if status_filter:
        q = q.filter(BorrowOrder.status == status_filter)
    total = q.count()
    items = q.order_by(BorrowOrder.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return items, total


def deliver_borrow_order(db: Session, order_id: uuid.UUID, deliverer: User) -> BorrowOrder:
    order = get_borrow_order(db, order_id)

    if order.status not in (BorrowOrderStatus.APPROVED, BorrowOrderStatus.READY_FOR_PICKUP):
        raise HTTPException(status_code=400, detail=f"当前状态 {order.status.value} 不可确认交付")

    order.status = BorrowOrderStatus.DELIVERED
    order.delivered_at = datetime.now(timezone.utc)
    order.delivered_by = deliverer.id

    # 设备状态 → 已借出
    for item in order.items:
        asset = db.query(Asset).filter(Asset.id == item.asset_id).first()
        if asset:
            asset.status = AssetStatus.BORROWED

    audit_service.log(db, deliverer.id, "BORROW_ORDER_DELIVER", "BorrowOrder", order.id, order.id, f"确认交付借用单 {order.order_no}")
    db.commit()
    db.refresh(order)
    return order


def cancel_borrow_order(db: Session, order_id: uuid.UUID, user: User) -> BorrowOrder:
    order = get_borrow_order(db, order_id)

    if order.applicant_id != user.id:
        raise HTTPException(status_code=403, detail="只能取消自己的借用单")
    if order.status != BorrowOrderStatus.PENDING_APPROVAL:
        raise HTTPException(status_code=400, detail="只有待审核状态的借用单可以取消")

    order.status = BorrowOrderStatus.CANCELLED

    # 恢复设备状态
    for item in order.items:
        asset = db.query(Asset).filter(Asset.id == item.asset_id).first()
        if asset and asset.status == AssetStatus.PENDING_BORROW_APPROVAL:
            asset.status = AssetStatus.IN_STOCK

    # 取消审批任务
    for task in order.approval_tasks:
        if task.status == ApprovalTaskStatus.PENDING:
            task.status = ApprovalTaskStatus.SKIPPED

    audit_service.log(db, user.id, "BORROW_ORDER_CANCEL", "BorrowOrder", order.id, order.id, f"取消借用单 {order.order_no}")
    db.commit()
    db.refresh(order)
    return order

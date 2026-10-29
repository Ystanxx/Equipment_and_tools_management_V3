"""Shared order scope for lists, details, and workflow attachments."""
from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import lazyload

from app.models.borrow_order import BorrowOrder
from app.models.borrow_order_item import BorrowOrderItem
from app.models.equipment_order import EquipmentOrder
from app.models.return_order import ReturnOrder
from app.models.return_order_item import ReturnOrderItem
from app.utils.enums import UserRole


def equipment_order_scope(user):
    if user.role == UserRole.SUPER_ADMIN:
        return True
    own = EquipmentOrder.applicant_id == user.id
    if user.role != UserRole.ASSET_ADMIN:
        return own
    borrowed = select(BorrowOrder.equipment_order_id).join(BorrowOrderItem).where(
        BorrowOrderItem.admin_id_snapshot == user.id)
    returned = select(ReturnOrder.equipment_order_id).join(ReturnOrderItem).where(
        ReturnOrderItem.admin_id_snapshot == user.id)
    return or_(own, EquipmentOrder.id.in_(borrowed), EquipmentOrder.id.in_(returned))


def require_order_access(db, order_id, user):
    if not db.query(EquipmentOrder.id).filter(
        EquipmentOrder.id == order_id, equipment_order_scope(user)
    ).first():
        raise HTTPException(403, "无权查看该订单")


def require_attachment_context(db, related_type, related_id, user):
    if related_type == "Asset":
        return  # Inventory images are public catalogue images.
    if related_type == "BorrowOrder":
        row = db.query(BorrowOrder.equipment_order_id).filter(BorrowOrder.id == related_id).first()
    elif related_type == "ReturnOrderItem":
        row = db.query(ReturnOrder.equipment_order_id).join(ReturnOrderItem).filter(
            ReturnOrderItem.id == related_id).first()
    else:
        raise HTTPException(400, "不支持的关联对象类型")
    if not row:
        raise HTTPException(404, "关联订单不存在")
    require_order_access(db, row[0], user)

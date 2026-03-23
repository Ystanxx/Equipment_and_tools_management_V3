"""Lightweight audit logging service."""
import uuid

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def log(
    db: Session,
    actor_id: uuid.UUID | None,
    action: str,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    equipment_order_id: uuid.UUID | None = None,
    order_id: uuid.UUID | None = None,
    description: str | None = None,
    snapshot: dict | None = None,
):
    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        equipment_order_id=equipment_order_id,
        order_id=order_id,
        description=description,
        snapshot=snapshot,
    )
    db.add(entry)


def list_logs(
    db: Session,
    action: str | None = None,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    equipment_order_id: uuid.UUID | None = None,
    order_id: uuid.UUID | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[AuditLog], int]:
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action == action)
    if target_type:
        q = q.filter(AuditLog.target_type == target_type)
    if target_id:
        q = q.filter(AuditLog.target_id == target_id)
    if equipment_order_id:
        q = q.filter(AuditLog.equipment_order_id == equipment_order_id)
    if order_id:
        q = q.filter(AuditLog.order_id == order_id)
    total = q.count()
    items = q.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return items, total

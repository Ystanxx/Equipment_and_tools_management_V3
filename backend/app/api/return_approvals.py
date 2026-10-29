from uuid import UUID

from collections import defaultdict
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, lazyload, joinedload

from app.core.deps import get_db, require_role
from app.models.user import User
from app.models.attachment import Attachment
from app.models.return_order import ReturnOrder
from app.models.return_order_item import ReturnOrderItem
from app.schemas.return_order import ReturnApprovalTaskOut, ReturnApprovalActionRequest, ReturnApprovalItemDetail
from app.schemas.common import ResponseSchema, PaginatedData
from app.services import return_approval_service
from app.services.attachment_access import image_path
from app.utils.enums import UserRole, PhotoType

router = APIRouter(prefix="/return-approval-tasks", tags=["归还审批"])


def _load_context(tasks, db):
    ids = {item_id for task in tasks for item_id in task.item_ids or []}
    orders = {o.id: o for o in db.query(ReturnOrder).options(
        lazyload("*"), joinedload(ReturnOrder.applicant)).filter(
        ReturnOrder.id.in_({t.return_order_id for t in tasks})).all()} if tasks else {}
    items = {i.id: i for i in db.query(ReturnOrderItem).options(lazyload("*")).filter(
        ReturnOrderItem.id.in_(ids)).all()} if ids else {}
    photos = defaultdict(list)
    if ids:
        for photo in db.query(Attachment).filter(Attachment.related_type == "ReturnOrderItem",
                Attachment.related_id.in_(ids), Attachment.photo_type == PhotoType.RETURN_ITEM).all():
            photos[photo.related_id].append(photo)
    return orders, items, photos


def _task_to_out(t, db: Session = None, user=None, context=None) -> ReturnApprovalTaskOut:
    item_details = []
    return_order_no = None
    return_order_status = None
    applicant_name = None
    equipment_order_id = None
    if db:
        orders, item_map, photo_map = context if context is not None else _load_context([t], db)
        items = [item_map[item_id] for item_id in t.item_ids or [] if item_id in item_map]
        for i in items:
            photos = photo_map[i.id]
            item_details.append(ReturnApprovalItemDetail(
                id=i.id, asset_id=i.asset_id,
                asset_code_snapshot=i.asset_code_snapshot,
                asset_name_snapshot=i.asset_name_snapshot,
                condition=i.condition.value if hasattr(i.condition, "value") else i.condition,
                damage_type=i.damage_type.value if i.damage_type and hasattr(i.damage_type, "value") else i.damage_type,
                damage_description=i.damage_description,
                photos=[{"id": str(p.id), "file_path": image_path(p.file_path, user)} for p in photos],
            ))
        ro = orders.get(t.return_order_id)
        if ro:
            return_order_no = ro.order_no
            return_order_status = ro.status.value if hasattr(ro.status, "value") else ro.status
            applicant_name = ro.applicant.full_name if ro.applicant else None
            equipment_order_id = ro.equipment_order_id
    return ReturnApprovalTaskOut(
        id=t.id,
        return_order_id=t.return_order_id,
        equipment_order_id=equipment_order_id,
        return_order_no=return_order_no,
        return_order_status=return_order_status,
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


@router.get("", summary="归还审批任务列表")
def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    history_only: bool = False,
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
        history_only=history_only,
        page=page,
        page_size=page_size,
    )
    context = _load_context(items, db)
    return ResponseSchema(
        data=PaginatedData(
            items=[_task_to_out(t, db, user, context) for t in items],
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
    return ResponseSchema(data=_task_to_out(task, db, user))


@router.post("/{task_id}/reject", summary="驳回归还审批")
def reject(
    task_id: UUID,
    body: ReturnApprovalActionRequest = ReturnApprovalActionRequest(),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN)),
):
    task = return_approval_service.reject_return_task(db, task_id, user, body.comment)
    return ResponseSchema(data=_task_to_out(task, db, user))

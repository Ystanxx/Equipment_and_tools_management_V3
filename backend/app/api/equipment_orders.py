from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_active_user, get_db
from app.models.user import User
from app.schemas.audit_log import AuditLogOut
from app.schemas.common import PaginatedData, ResponseSchema
from app.schemas.equipment_order import (
    EquipmentOrderApprovalTaskOut,
    EquipmentOrderBorrowStageOut,
    EquipmentOrderBrief,
    EquipmentOrderItemOut,
    EquipmentOrderOut,
    EquipmentOrderReturnBatchOut,
    EquipmentOrderReturnItemOut,
)
from app.services import equipment_order_service
from app.utils.enums import UserRole

router = APIRouter(prefix="/equipment-orders", tags=["统一订单"])


def _task_to_out(task) -> EquipmentOrderApprovalTaskOut:
    return EquipmentOrderApprovalTaskOut(
        id=task.id,
        approver_id=task.approver_id,
        approver_name=task.approver.full_name if task.approver else None,
        item_ids=task.item_ids or [],
        status=task.status.value if hasattr(task.status, "value") else task.status,
        comment=task.comment,
        decided_at=task.decided_at,
        created_at=task.created_at,
    )


def _order_to_out(db: Session, order) -> EquipmentOrderOut:
    borrow_order = order.borrow_order
    items = equipment_order_service.list_order_items(db, borrow_order.id) if borrow_order else []
    borrow_tasks = equipment_order_service.list_borrow_approval_tasks(db, borrow_order.id) if borrow_order else []

    return_batches = []
    for return_order in sorted(order.return_orders or [], key=lambda item: item.created_at):
        return_tasks = equipment_order_service.list_return_approval_tasks(db, return_order.id)
        return_batches.append(
            EquipmentOrderReturnBatchOut(
                id=return_order.id,
                order_no=return_order.order_no,
                status=return_order.status.value if hasattr(return_order.status, "value") else return_order.status,
                item_count=return_order.item_count,
                remark=return_order.remark,
                created_at=return_order.created_at,
                updated_at=return_order.updated_at,
                approval_tasks=[_task_to_out(task) for task in return_tasks],
                items=[
                    EquipmentOrderReturnItemOut(
                        id=item.id,
                        asset_id=item.asset_id,
                        borrow_order_item_id=item.borrow_order_item_id,
                        asset_code_snapshot=item.asset_code_snapshot,
                        asset_name_snapshot=item.asset_name_snapshot,
                        admin_name_snapshot=item.admin_name_snapshot,
                        condition=item.condition.value if hasattr(item.condition, "value") else item.condition,
                        damage_type=item.damage_type.value if item.damage_type and hasattr(item.damage_type, "value") else item.damage_type,
                        damage_description=item.damage_description,
                        created_at=item.created_at,
                    )
                    for item in return_order.items
                ],
            )
        )

    return EquipmentOrderOut(
        id=order.id,
        order_no=order.order_no,
        applicant_id=order.applicant_id,
        applicant_name=order.applicant.full_name if order.applicant else None,
        status=equipment_order_service.resolve_equipment_order_status(order),
        purpose=order.purpose,
        expected_return_date=order.expected_return_date,
        item_count=order.item_count,
        remark=order.remark,
        delivered_at=order.delivered_at,
        delivered_by=order.delivered_by,
        completed_at=order.completed_at,
        created_at=order.created_at,
        updated_at=order.updated_at,
        items=[
            EquipmentOrderItemOut(
                id=item.id,
                asset_id=item.asset_id,
                asset_code_snapshot=item.asset_code_snapshot,
                asset_name_snapshot=item.asset_name_snapshot,
                admin_name_snapshot=item.admin_name_snapshot,
                location_name_snapshot=item.location_name_snapshot,
                created_at=item.created_at,
            )
            for item in items
        ],
        borrow_order=EquipmentOrderBorrowStageOut(
            id=borrow_order.id,
            order_no=borrow_order.order_no,
            status=borrow_order.status.value if hasattr(borrow_order.status, "value") else borrow_order.status,
            delivered_at=borrow_order.delivered_at,
            delivered_by=borrow_order.delivered_by,
            created_at=borrow_order.created_at,
            updated_at=borrow_order.updated_at,
            approval_tasks=[_task_to_out(task) for task in borrow_tasks],
        ) if borrow_order else None,
        return_orders=return_batches,
    )


def _ensure_can_view(user: User, order) -> None:
    if user.role in (UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN):
        return
    if order.applicant_id != user.id:
        raise HTTPException(status_code=403, detail="无权查看该订单")


@router.get("", summary="统一订单列表")
def list_orders(
    page: int = 1,
    page_size: int = 20,
    mine: bool = False,
    status_group: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    applicant_id = user.id if (mine or user.role == UserRole.USER) else None
    items, total = equipment_order_service.list_equipment_orders(
        db=db,
        applicant_id=applicant_id,
        status_group=status_group,
        page=page,
        page_size=page_size,
    )
    out = [
        EquipmentOrderBrief(
            id=item.id,
            order_no=item.order_no,
            applicant_id=item.applicant_id,
            applicant_name=item.applicant.full_name if item.applicant else None,
            status=equipment_order_service.resolve_equipment_order_status(item),
            item_count=item.item_count,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item in items
    ]
    return ResponseSchema(data=PaginatedData(items=out, total=total, page=page, page_size=page_size))


@router.get("/{order_id}", summary="统一订单详情")
def get_order(
    order_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    order = equipment_order_service.require_equipment_order(db, order_id)
    _ensure_can_view(user, order)
    return ResponseSchema(data=_order_to_out(db, order))


@router.get("/{order_id}/timeline", summary="统一订单时间线")
def get_timeline(
    order_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    order = equipment_order_service.require_equipment_order(db, order_id)
    _ensure_can_view(user, order)
    logs = equipment_order_service.list_order_timeline(db, order_id)
    return ResponseSchema(data=[AuditLogOut.model_validate(item) for item in logs])

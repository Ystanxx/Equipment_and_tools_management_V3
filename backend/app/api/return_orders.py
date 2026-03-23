from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_active_user, require_role
from app.models.user import User
from app.schemas.return_order import (
    ReturnOrderCreate,
    ReturnOrderOut,
    ReturnOrderBrief,
    ReturnOrderItemOut,
    ReturnApprovalTaskOut,
)
from app.schemas.common import ResponseSchema, PaginatedData
from app.services import return_service
from app.utils.enums import UserRole

router = APIRouter(prefix="/return-orders", tags=["归还单"])


def _order_to_out(order) -> ReturnOrderOut:
    return ReturnOrderOut(
        id=order.id,
        equipment_order_id=order.equipment_order_id,
        order_no=order.order_no,
        borrow_order_id=order.borrow_order_id,
        borrow_order_no=order.borrow_order.order_no if order.borrow_order else None,
        applicant_id=order.applicant_id,
        applicant_name=order.applicant.full_name if order.applicant else None,
        status=order.status.value if hasattr(order.status, "value") else order.status,
        item_count=order.item_count,
        remark=order.remark,
        created_at=order.created_at,
        updated_at=order.updated_at,
        items=[
            ReturnOrderItemOut(
                id=i.id,
                asset_id=i.asset_id,
                borrow_order_item_id=i.borrow_order_item_id,
                asset_code_snapshot=i.asset_code_snapshot,
                asset_name_snapshot=i.asset_name_snapshot,
                admin_name_snapshot=i.admin_name_snapshot,
                condition=i.condition.value if hasattr(i.condition, "value") else i.condition,
                damage_type=i.damage_type.value if i.damage_type and hasattr(i.damage_type, "value") else i.damage_type,
                damage_description=i.damage_description,
                created_at=i.created_at,
            )
            for i in order.items
        ],
        approval_tasks=[
            ReturnApprovalTaskOut(
                id=t.id,
                return_order_id=t.return_order_id,
                approver_id=t.approver_id,
                approver_name=t.approver.full_name if t.approver else None,
                item_ids=t.item_ids or [],
                status=t.status.value if hasattr(t.status, "value") else t.status,
                comment=t.comment,
                decided_at=t.decided_at,
                created_at=t.created_at,
            )
            for t in (order.approval_tasks or [])
        ],
    )


@router.post("", summary="提交归还单")
def create_order(
    body: ReturnOrderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    items_data = [item.model_dump() for item in body.items]
    order = return_service.create_return_order(
        db=db,
        applicant=user,
        borrow_order_id=body.borrow_order_id,
        items_input=items_data,
        remark=body.remark,
    )
    return ResponseSchema(data=_order_to_out(order))


@router.get("", summary="归还单列表")
def list_orders(
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    borrow_order_id: UUID | None = None,
    mine: bool = False,
    managed: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    applicant_id = user.id if (mine or user.role == UserRole.USER) else None
    managed_admin_id = user.id if (managed and user.role == UserRole.ASSET_ADMIN) else None
    items, total = return_service.list_return_orders(
        db=db,
        applicant_id=applicant_id,
        managed_admin_id=managed_admin_id,
        borrow_order_id=borrow_order_id,
        status_filter=status,
        page=page,
        page_size=page_size,
    )
    briefs = [
        ReturnOrderBrief(
            id=o.id,
            equipment_order_id=o.equipment_order_id,
            order_no=o.order_no,
            borrow_order_no=o.borrow_order.order_no if o.borrow_order else None,
            applicant_id=o.applicant_id,
            applicant_name=o.applicant.full_name if o.applicant else None,
            status=o.status.value if hasattr(o.status, "value") else o.status,
            item_count=o.item_count,
            created_at=o.created_at,
        )
        for o in items
    ]
    return ResponseSchema(data=PaginatedData(items=briefs, total=total, page=page, page_size=page_size))


@router.get("/{order_id}", summary="归还单详情")
def get_order(
    order_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    order = return_service.get_return_order(db, order_id)
    if not return_service.user_can_access_return_order(order, user):
        raise HTTPException(status_code=403, detail="无权查看该归还单")
    return ResponseSchema(data=_order_to_out(order))


@router.post("/{order_id}/stock-in", summary="确认入库")
def stock_in_order(
    order_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN)),
):
    order = return_service.stock_in_return_order(db, order_id, user)
    return ResponseSchema(data=_order_to_out(order))

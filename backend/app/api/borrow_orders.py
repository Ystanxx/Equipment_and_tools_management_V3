from uuid import UUID

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_active_user, require_role
from app.models.user import User
from app.schemas.borrow_order import (
    BorrowOrderCreate,
    BorrowOrderOut,
    BorrowOrderBrief,
    BorrowOrderItemOut,
    BorrowApprovalTaskOut,
)
from app.schemas.common import ResponseSchema, PaginatedData
from app.services import borrow_service
from app.utils.enums import UserRole

router = APIRouter(prefix="/borrow-orders", tags=["借用单"])


def _order_to_out(order) -> BorrowOrderOut:
    return BorrowOrderOut(
        id=order.id,
        order_no=order.order_no,
        applicant_id=order.applicant_id,
        applicant_name=order.applicant.full_name if order.applicant else None,
        status=order.status.value if hasattr(order.status, "value") else order.status,
        purpose=order.purpose,
        expected_return_date=order.expected_return_date,
        item_count=order.item_count,
        remark=order.remark,
        delivered_at=order.delivered_at,
        delivered_by=order.delivered_by,
        created_at=order.created_at,
        updated_at=order.updated_at,
        items=[
            BorrowOrderItemOut(
                id=i.id,
                asset_id=i.asset_id,
                asset_code_snapshot=i.asset_code_snapshot,
                asset_name_snapshot=i.asset_name_snapshot,
                admin_name_snapshot=i.admin_name_snapshot,
                location_name_snapshot=i.location_name_snapshot,
                created_at=i.created_at,
            )
            for i in order.items
        ],
        approval_tasks=[
            BorrowApprovalTaskOut(
                id=t.id,
                order_id=t.order_id,
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


@router.post("", summary="提交借用单")
def create_order(
    body: BorrowOrderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    order = borrow_service.create_borrow_order(
        db=db,
        applicant=user,
        asset_ids=body.asset_ids,
        purpose=body.purpose,
        expected_return_date=body.expected_return_date,
        remark=body.remark,
    )
    return ResponseSchema(data=_order_to_out(order))


@router.get("", summary="借用单列表")
def list_orders(
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    mine: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    applicant_id = user.id if (mine or user.role == UserRole.USER) else None
    items, total = borrow_service.list_borrow_orders(
        db=db,
        applicant_id=applicant_id,
        status_filter=status,
        page=page,
        page_size=page_size,
    )
    briefs = [
        BorrowOrderBrief(
            id=o.id,
            order_no=o.order_no,
            applicant_id=o.applicant_id,
            applicant_name=o.applicant.full_name if o.applicant else None,
            status=o.status.value if hasattr(o.status, "value") else o.status,
            item_count=o.item_count,
            created_at=o.created_at,
        )
        for o in items
    ]
    return ResponseSchema(data=PaginatedData(items=briefs, total=total, page=page, page_size=page_size))


@router.get("/{order_id}", summary="借用单详情")
def get_order(
    order_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    order = borrow_service.get_borrow_order(db, order_id)
    # 普通用户只能查看自己的
    if user.role == UserRole.USER and order.applicant_id != user.id:
        raise HTTPException(status_code=403, detail="无权查看该借用单")
    return ResponseSchema(data=_order_to_out(order))


@router.post("/{order_id}/deliver", summary="确认交付")
def deliver_order(
    order_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN)),
):
    order = borrow_service.deliver_borrow_order(db, order_id, user)
    return ResponseSchema(data=_order_to_out(order))


@router.post("/{order_id}/cancel", summary="取消借用单")
def cancel_order(
    order_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    order = borrow_service.cancel_borrow_order(db, order_id, user)
    return ResponseSchema(data=_order_to_out(order))

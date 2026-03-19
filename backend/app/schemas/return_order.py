from datetime import datetime
from uuid import UUID
from typing import Optional

from pydantic import BaseModel, Field


# ===== Request schemas =====

class ReturnItemInput(BaseModel):
    borrow_order_item_id: UUID
    asset_id: UUID
    condition: str  # GOOD, PARTIAL_LOSS, FULL_LOSS, DAMAGED
    damage_type: Optional[str] = None
    damage_description: Optional[str] = None


class ReturnOrderCreate(BaseModel):
    borrow_order_id: UUID
    items: list[ReturnItemInput] = Field(..., min_length=1)
    remark: Optional[str] = None


# ===== Item response =====

class ReturnOrderItemOut(BaseModel):
    id: UUID
    asset_id: UUID
    borrow_order_item_id: UUID
    asset_code_snapshot: str
    asset_name_snapshot: str
    admin_name_snapshot: str
    condition: str
    damage_type: Optional[str] = None
    damage_description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ===== Approval task response =====

class ReturnApprovalTaskOut(BaseModel):
    id: UUID
    return_order_id: UUID
    approver_id: UUID
    approver_name: Optional[str] = None
    item_ids: list[UUID] = []
    status: str
    comment: Optional[str] = None
    decided_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ===== Order response =====

class ReturnOrderOut(BaseModel):
    id: UUID
    order_no: str
    borrow_order_id: UUID
    borrow_order_no: Optional[str] = None
    applicant_id: UUID
    applicant_name: Optional[str] = None
    status: str
    item_count: int
    remark: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    items: list[ReturnOrderItemOut] = []
    approval_tasks: list[ReturnApprovalTaskOut] = []

    class Config:
        from_attributes = True


class ReturnOrderBrief(BaseModel):
    id: UUID
    order_no: str
    borrow_order_no: Optional[str] = None
    applicant_id: UUID
    applicant_name: Optional[str] = None
    status: str
    item_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class ReturnApprovalActionRequest(BaseModel):
    comment: Optional[str] = None

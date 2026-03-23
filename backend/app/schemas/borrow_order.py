from datetime import datetime
from uuid import UUID
from typing import Optional

from pydantic import BaseModel, Field


# ===== Request schemas =====

class BorrowCartItem(BaseModel):
    asset_id: UUID


class BorrowOrderCreate(BaseModel):
    asset_ids: list[UUID] = Field(..., min_length=1)
    purpose: Optional[str] = None
    expected_return_date: Optional[str] = None
    remark: Optional[str] = None


class BorrowOrderDeliverRequest(BaseModel):
    pass  # no body needed; authenticated user is the deliverer


# ===== Item response =====

class BorrowOrderItemOut(BaseModel):
    id: UUID
    asset_id: UUID
    asset_code_snapshot: str
    asset_name_snapshot: str
    admin_name_snapshot: str
    location_name_snapshot: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ===== Approval task response =====

class ApprovalItemDetail(BaseModel):
    id: UUID
    asset_id: UUID
    asset_code_snapshot: str
    asset_name_snapshot: str
    location_name_snapshot: Optional[str] = None


class BorrowApprovalTaskOut(BaseModel):
    id: UUID
    order_id: UUID
    order_no: Optional[str] = None
    applicant_name: Optional[str] = None
    approver_id: UUID
    approver_name: Optional[str] = None
    item_ids: list[UUID] = []
    item_details: list[ApprovalItemDetail] = []
    status: str
    comment: Optional[str] = None
    decided_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ===== Order response =====

class BorrowOrderOut(BaseModel):
    id: UUID
    order_no: str
    applicant_id: UUID
    applicant_name: Optional[str] = None
    status: str
    purpose: Optional[str] = None
    expected_return_date: Optional[str] = None
    item_count: int
    remark: Optional[str] = None
    delivered_at: Optional[datetime] = None
    delivered_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    items: list[BorrowOrderItemOut] = []
    approval_tasks: list[BorrowApprovalTaskOut] = []

    class Config:
        from_attributes = True


class BorrowOrderBrief(BaseModel):
    id: UUID
    order_no: str
    applicant_id: UUID
    applicant_name: Optional[str] = None
    status: str
    item_count: int
    created_at: datetime

    class Config:
        from_attributes = True


# ===== Approval action =====

class ApprovalActionRequest(BaseModel):
    comment: Optional[str] = None

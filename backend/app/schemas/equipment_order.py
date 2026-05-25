from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class EquipmentOrderItemOut(BaseModel):
    id: UUID
    asset_id: UUID
    asset_code_snapshot: str
    asset_name_snapshot: str
    admin_name_snapshot: str
    location_name_snapshot: Optional[str] = None
    created_at: datetime


class EquipmentOrderApprovalTaskOut(BaseModel):
    id: UUID
    approver_id: UUID
    approver_name: Optional[str] = None
    item_ids: list[UUID] = Field(default_factory=list)
    status: str
    comment: Optional[str] = None
    decided_at: Optional[datetime] = None
    created_at: datetime


class EquipmentOrderBorrowStageOut(BaseModel):
    id: UUID
    order_no: str
    status: str
    delivered_at: Optional[datetime] = None
    delivered_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    approval_tasks: list[EquipmentOrderApprovalTaskOut] = Field(default_factory=list)


class EquipmentOrderReturnItemOut(BaseModel):
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


class EquipmentOrderReturnBatchOut(BaseModel):
    id: UUID
    order_no: str
    status: str
    item_count: int
    remark: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    approval_tasks: list[EquipmentOrderApprovalTaskOut] = Field(default_factory=list)
    items: list[EquipmentOrderReturnItemOut] = Field(default_factory=list)


class EquipmentOrderBrief(BaseModel):
    id: UUID
    order_no: str
    applicant_id: UUID
    applicant_name: Optional[str] = None
    status: str
    item_count: int
    created_at: datetime
    updated_at: datetime


class EquipmentOrderOut(BaseModel):
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
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    items: list[EquipmentOrderItemOut] = Field(default_factory=list)
    borrow_order: Optional[EquipmentOrderBorrowStageOut] = None
    return_orders: list[EquipmentOrderReturnBatchOut] = Field(default_factory=list)

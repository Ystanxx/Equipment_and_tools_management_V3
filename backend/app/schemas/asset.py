import uuid
from datetime import date, datetime
from pydantic import BaseModel

from app.utils.enums import AssetStatus


class AssetCreate(BaseModel):
    name: str
    asset_type_id: uuid.UUID
    category_id: uuid.UUID | None = None
    location_id: uuid.UUID | None = None
    admin_id: uuid.UUID | None = None
    brand: str | None = None
    model: str | None = None
    serial_number: str | None = None
    description: str | None = None
    entry_date: date | None = None
    remark: str | None = None


class AssetUpdate(BaseModel):
    name: str | None = None
    asset_type_id: uuid.UUID | None = None
    status: AssetStatus | None = None
    category_id: uuid.UUID | None = None
    location_id: uuid.UUID | None = None
    brand: str | None = None
    model: str | None = None
    serial_number: str | None = None
    description: str | None = None
    entry_date: date | None = None
    remark: str | None = None
    is_active: bool | None = None


class AdminUpdateRequest(BaseModel):
    admin_id: uuid.UUID


class AssetOut(BaseModel):
    id: uuid.UUID
    asset_code: str
    name: str
    asset_type_id: uuid.UUID | None = None
    asset_type_name: str | None = None
    category_id: uuid.UUID | None = None
    category_name: str | None = None
    location_id: uuid.UUID | None = None
    location_name: str | None = None
    admin_id: uuid.UUID
    admin_name: str | None = None
    borrower_name: str | None = None
    status: AssetStatus
    display_status: str | None = None
    brand: str | None = None
    model: str | None = None
    serial_number: str | None = None
    description: str | None = None
    entry_date: date | None = None
    created_by: uuid.UUID
    remark: str | None = None
    preview_file_path: str | None = None
    preview_thumb_path: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AssetLiveStateOut(BaseModel):
    asset_version: str | None = None
    updated_asset_count: int = 0

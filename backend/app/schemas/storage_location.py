import uuid
from datetime import datetime
from pydantic import BaseModel


class LocationCreate(BaseModel):
    code: str | None = None
    name: str
    building: str | None = None
    room: str | None = None
    cabinet: str | None = None
    shelf: str | None = None
    remark: str | None = None


class LocationUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    building: str | None = None
    room: str | None = None
    cabinet: str | None = None
    shelf: str | None = None
    remark: str | None = None
    is_active: bool | None = None


class LocationOut(BaseModel):
    id: uuid.UUID
    code: str | None = None
    name: str
    building: str | None = None
    room: str | None = None
    cabinet: str | None = None
    shelf: str | None = None
    remark: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

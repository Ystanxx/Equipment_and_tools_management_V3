import uuid
from datetime import datetime

from pydantic import BaseModel


class AssetTypeCreate(BaseModel):
    name: str
    description: str | None = None


class AssetTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class AssetTypeOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

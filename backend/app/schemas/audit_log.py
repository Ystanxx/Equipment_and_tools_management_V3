from datetime import datetime
from uuid import UUID
from typing import Optional

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: UUID
    actor_id: Optional[UUID] = None
    action: str
    target_type: Optional[str] = None
    target_id: Optional[UUID] = None
    order_id: Optional[UUID] = None
    description: Optional[str] = None
    snapshot: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True

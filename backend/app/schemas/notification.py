from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: UUID
    recipient_id: UUID
    title: str
    content: str
    notification_type: str
    related_type: str | None = None
    related_id: UUID | None = None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

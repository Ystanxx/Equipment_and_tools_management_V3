import uuid
from datetime import datetime
from pydantic import BaseModel

from app.utils.enums import RegistrationStatus
from app.schemas.user import UserOut


class RegistrationRequestOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    status: RegistrationStatus
    reviewer_id: uuid.UUID | None = None
    reject_reason: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime
    user: UserOut | None = None

    model_config = {"from_attributes": True}


class RejectRequest(BaseModel):
    reason: str | None = None

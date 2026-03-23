import uuid
from datetime import datetime
from pydantic import BaseModel

from app.utils.enums import UserRole, UserStatus


class UserOut(BaseModel):
    id: uuid.UUID
    username: str
    email: str
    full_name: str
    phone: str | None = None
    department: str | None = None
    employee_id: str | None = None
    role: UserRole
    status: UserStatus
    email_notifications_enabled: bool = True
    remark: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RoleUpdateRequest(BaseModel):
    role: UserRole


class StatusUpdateRequest(BaseModel):
    status: UserStatus


class EmailNotificationPreferenceUpdateRequest(BaseModel):
    email_notifications_enabled: bool


class UserProfileUpdateRequest(BaseModel):
    username: str
    full_name: str
    email: str

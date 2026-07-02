from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class SystemConfigItem(BaseModel):
    key: str
    label: str
    value: Any
    default_value: Any
    value_type: str
    description: str
    group: str
    is_public: bool
    is_secret: bool = False
    has_value: bool = False
    min_value: int | None = None
    max_value: int | None = None
    options: list[str] = Field(default_factory=list)
    updated_at: datetime | None = None


class SystemConfigUpdateRequest(BaseModel):
    values: dict[str, bool | int | str | None]


class SmtpTestEmailRequest(BaseModel):
    to_email: EmailStr | None = None

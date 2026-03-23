from datetime import datetime
from typing import Any

from pydantic import BaseModel


class SystemConfigItem(BaseModel):
    key: str
    label: str
    value: Any
    default_value: Any
    value_type: str
    description: str
    group: str
    is_public: bool
    min_value: int | None = None
    max_value: int | None = None
    options: list[str] = []
    updated_at: datetime | None = None


class SystemConfigUpdateRequest(BaseModel):
    values: dict[str, bool | int | str | None]

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import Session

from app.models.system_config import SystemConfig
from app.models.user import User
from app.services import audit_service


@dataclass(frozen=True)
class ConfigDefinition:
    key: str
    default: bool | int | str
    value_type: str
    label: str
    description: str
    group: str = "general"
    is_public: bool = False
    min_value: int | None = None
    max_value: int | None = None
    options: tuple[str, ...] = ()


CONFIG_DEFINITIONS: dict[str, ConfigDefinition] = {
    "borrow_order_max_items": ConfigDefinition(
        key="borrow_order_max_items",
        default=20,
        value_type="int",
        label="借用单最大件数",
        description="单次借用允许提交的最大件数",
        group="borrow",
        is_public=True,
        min_value=1,
        max_value=100,
    ),
    "require_borrow_purpose": ConfigDefinition(
        key="require_borrow_purpose",
        default=False,
        value_type="bool",
        label="强制填写借用用途",
        description="是否强制填写借用用途",
        group="borrow",
        is_public=True,
    ),
    "require_expected_return_time": ConfigDefinition(
        key="require_expected_return_time",
        default=False,
        value_type="bool",
        label="强制填写预计归还时间",
        description="是否强制填写预计归还时间",
        group="borrow",
        is_public=True,
    ),
    "photo_max_upload_mb": ConfigDefinition(
        key="photo_max_upload_mb",
        default=10,
        value_type="int",
        label="图片上传大小限制",
        description="单个图片文件允许上传的最大体积（MB）",
        group="photo",
        is_public=True,
        min_value=1,
        max_value=50,
    ),
    "photo_target_format": ConfigDefinition(
        key="photo_target_format",
        default="JPEG",
        value_type="str",
        label="图片标准化格式",
        description="图片标准化保存格式，支持 JPEG/PNG/WEBP",
        group="photo",
        options=("JPEG", "PNG", "WEBP"),
    ),
    "photo_standard_max_edge": ConfigDefinition(
        key="photo_standard_max_edge",
        default=1600,
        value_type="int",
        label="标准图最长边",
        description="标准图最长边像素",
        group="photo",
        min_value=320,
        max_value=5000,
    ),
    "photo_standard_quality": ConfigDefinition(
        key="photo_standard_quality",
        default=82,
        value_type="int",
        label="标准图压缩质量",
        description="标准图压缩质量",
        group="photo",
        min_value=40,
        max_value=100,
    ),
    "photo_thumb_max_edge": ConfigDefinition(
        key="photo_thumb_max_edge",
        default=360,
        value_type="int",
        label="缩略图最长边",
        description="缩略图最长边像素",
        group="photo",
        min_value=120,
        max_value=1200,
    ),
    "inventory_photo_keep_count": ConfigDefinition(
        key="inventory_photo_keep_count",
        default=5,
        value_type="int",
        label="库存照片保留数量",
        description="库存照片滚动保留数量",
        group="photo",
        min_value=1,
        max_value=50,
    ),
    "borrow_photo_keep_days": ConfigDefinition(
        key="borrow_photo_keep_days",
        default=180,
        value_type="int",
        label="借出照片保留天数",
        description="借出照片保留天数",
        group="photo",
        min_value=1,
        max_value=3650,
    ),
    "return_photo_keep_days": ConfigDefinition(
        key="return_photo_keep_days",
        default=365,
        value_type="int",
        label="归还照片保留天数",
        description="归还照片保留天数",
        group="photo",
        min_value=1,
        max_value=3650,
    ),
    "incident_photo_keep_days": ConfigDefinition(
        key="incident_photo_keep_days",
        default=365,
        value_type="int",
        label="异常照片保留天数",
        description="异常照片保留天数",
        group="photo",
        min_value=1,
        max_value=3650,
    ),
    "photo_cleanup_enabled": ConfigDefinition(
        key="photo_cleanup_enabled",
        default=True,
        value_type="bool",
        label="启用图片清理任务",
        description="是否启用图片清理任务",
        group="photo",
    ),
    "enable_in_app_notifications": ConfigDefinition(
        key="enable_in_app_notifications",
        default=True,
        value_type="bool",
        label="启用站内通知",
        description="是否启用站内通知",
        group="notification",
    ),
    "enable_email_notifications": ConfigDefinition(
        key="enable_email_notifications",
        default=False,
        value_type="bool",
        label="启用邮件通知",
        description="是否启用邮件通知",
        group="notification",
    ),
}

MISSING_TABLE_MESSAGE = "system_configs 表不存在，请先执行 alembic upgrade head"


def list_configs(db: Session, public_only: bool = False) -> list[dict[str, Any]]:
    persisted = _query_configs(db, CONFIG_DEFINITIONS.keys(), allow_missing_table=True)
    items: list[dict[str, Any]] = []
    for definition in CONFIG_DEFINITIONS.values():
        if public_only and not definition.is_public:
            continue
        items.append(_build_config_item(definition, persisted.get(definition.key)))
    return items


def get_config_value(db: Session, key: str) -> bool | int | str:
    definition = CONFIG_DEFINITIONS.get(key)
    if not definition:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"未知配置项: {key}")
    item = _query_configs(db, [key], allow_missing_table=True).get(key)
    return _deserialize_value(definition, item.value if item else None)


def update_configs(db: Session, values: dict[str, bool | int | str | None], operator: User) -> list[dict[str, Any]]:
    if not values:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="至少需要更新一个配置项")

    persisted = _query_configs(db, values.keys(), allow_missing_table=False)

    for key, raw_value in values.items():
        definition = CONFIG_DEFINITIONS.get(key)
        if not definition:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"未知配置项: {key}")

        normalized_value = _normalize_value(definition, raw_value)
        item = persisted.get(key)
        if item is None:
            item = SystemConfig(
                key=key,
                value=_serialize_value(definition, normalized_value),
                description=definition.description,
                updated_by=operator.id,
            )
            db.add(item)
            persisted[key] = item
        else:
            item.value = _serialize_value(definition, normalized_value)
            item.description = definition.description
            item.updated_by = operator.id

    audit_service.log(
        db,
        operator.id,
        "SYSTEM_CONFIG_UPDATE",
        "SystemConfig",
        description=f"更新系统配置：{', '.join(sorted(values.keys()))}",
        snapshot={key: _normalize_value(CONFIG_DEFINITIONS[key], value) for key, value in values.items()},
    )
    db.commit()

    refreshed = _query_configs(db, CONFIG_DEFINITIONS.keys(), allow_missing_table=False)
    return [_build_config_item(definition, refreshed.get(definition.key)) for definition in CONFIG_DEFINITIONS.values()]


def _query_configs(
    db: Session,
    keys: Any,
    *,
    allow_missing_table: bool,
) -> dict[str, SystemConfig]:
    try:
        return {
            item.key: item
            for item in db.query(SystemConfig).filter(SystemConfig.key.in_(tuple(keys))).all()
        }
    except (ProgrammingError, OperationalError) as exc:
        if not _is_missing_system_config_table(exc):
            raise
        db.rollback()
        if allow_missing_table:
            return {}
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=MISSING_TABLE_MESSAGE,
        ) from exc


def _is_missing_system_config_table(exc: ProgrammingError | OperationalError) -> bool:
    original = getattr(exc, "orig", exc)
    sqlstate = getattr(original, "sqlstate", None) or getattr(original, "pgcode", None)
    if sqlstate == "42P01":
        return True

    message = str(original).lower()
    return (
        "system_configs" in message
        and (
            "does not exist" in message
            or "undefinedtable" in message
            or "no such table" in message
        )
    )


def _build_config_item(definition: ConfigDefinition, item: SystemConfig | None) -> dict[str, Any]:
    return {
        "key": definition.key,
        "label": definition.label,
        "value": _deserialize_value(definition, item.value if item else None),
        "default_value": definition.default,
        "value_type": definition.value_type,
        "description": definition.description,
        "group": definition.group,
        "is_public": definition.is_public,
        "min_value": definition.min_value,
        "max_value": definition.max_value,
        "options": list(definition.options) if definition.options else [],
        "updated_at": item.updated_at if item else None,
    }


def _serialize_value(definition: ConfigDefinition, value: bool | int | str) -> str:
    if definition.value_type == "bool":
        return "true" if bool(value) else "false"
    return str(value)


def _deserialize_value(definition: ConfigDefinition, value: str | None) -> bool | int | str:
    if value is None:
        return definition.default
    if definition.value_type == "bool":
        return value.lower() in {"1", "true", "yes", "on"}
    if definition.value_type == "int":
        return int(value)
    return value


def _normalize_value(definition: ConfigDefinition, value: bool | int | str | None) -> bool | int | str:
    if value is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"配置项 {definition.key} 不能为空")

    try:
        if definition.value_type == "bool":
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                lowered = value.lower()
                if lowered in {"1", "true", "yes", "on"}:
                    return True
                if lowered in {"0", "false", "no", "off"}:
                    return False
            raise ValueError

        if definition.value_type == "int":
            normalized = int(value)
            if definition.min_value is not None and normalized < definition.min_value:
                raise ValueError
            if definition.max_value is not None and normalized > definition.max_value:
                raise ValueError
            return normalized

        normalized_text = str(value).strip().upper() if definition.key == "photo_target_format" else str(value).strip()
        if definition.options and normalized_text not in definition.options:
            raise ValueError
        if not normalized_text:
            raise ValueError
        return normalized_text
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"配置项 {definition.key} 的值不合法",
        ) from exc

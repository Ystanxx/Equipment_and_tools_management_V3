from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_active_user, require_super_admin
from app.models.user import User
from app.schemas.common import ResponseSchema
from app.schemas.system_config import SystemConfigItem, SystemConfigUpdateRequest
from app.services import system_config_service
from app.utils.enums import UserRole

router = APIRouter(prefix="/system-configs", tags=["系统配置"])


@router.get("", response_model=ResponseSchema[list[SystemConfigItem]])
def list_system_configs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_active_user),
):
    items = system_config_service.list_configs(db, public_only=current_user.role != UserRole.SUPER_ADMIN)
    return ResponseSchema(data=[SystemConfigItem(**item) for item in items])


@router.put("", response_model=ResponseSchema[list[SystemConfigItem]])
def update_system_configs(
    body: SystemConfigUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    items = system_config_service.update_configs(db, body.values, current_user)
    return ResponseSchema(data=[SystemConfigItem(**item) for item in items], message="系统配置已更新")

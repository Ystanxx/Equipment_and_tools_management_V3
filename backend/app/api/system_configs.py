from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_active_user, require_super_admin
from app.models.user import User
from app.schemas.common import ResponseSchema
from app.schemas.system_config import SystemConfigItem, SystemConfigUpdateRequest, SmtpTestEmailRequest
from app.services import email_service, system_config_service
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


@router.post("/test-email", response_model=ResponseSchema[dict], summary="发送 SMTP 测试邮件")
def send_test_email(
    body: SmtpTestEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    target_email = str(body.to_email or current_user.email)
    if not email_service.is_smtp_configured(db):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SMTP 配置不完整，请先填写服务器、账号和密码",
        )
    if not email_service.send_test_email(target_email, db=db):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="测试邮件发送失败，请检查 SMTP 参数或服务商认证方式",
        )
    return ResponseSchema(data={"to_email": target_email}, message="测试邮件已发送")

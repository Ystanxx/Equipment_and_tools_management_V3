from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user, get_active_user
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, ChangePasswordRequest, TokenResponse
from app.schemas.user import UserOut, EmailNotificationPreferenceUpdateRequest
from app.schemas.common import ResponseSchema
from app.services import auth_service, user_service

router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/register", response_model=ResponseSchema[UserOut])
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    user = auth_service.register_user(db, req)
    return ResponseSchema(data=UserOut.model_validate(user), message="注册成功，请等待管理员审核")


@router.post("/login", response_model=ResponseSchema[TokenResponse])
def login(req: LoginRequest, db: Session = Depends(get_db)):
    token = auth_service.login_user(db, req)
    return ResponseSchema(data=token)


@router.get("/me", response_model=ResponseSchema[UserOut])
def me(current_user: User = Depends(get_current_user)):
    return ResponseSchema(data=UserOut.model_validate(current_user))


@router.put("/preferences/email", response_model=ResponseSchema[UserOut], summary="更新当前用户邮件通知偏好")
def update_email_notification_preference(
    body: EmailNotificationPreferenceUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = user_service.update_email_notification_preference(
        db,
        current_user,
        body.email_notifications_enabled,
    )
    return ResponseSchema(data=UserOut.model_validate(user), message="邮件通知设置已更新")


@router.api_route("/password", methods=["PUT", "POST"], summary="修改密码")
def change_password(
    req: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    auth_service.change_password(db, user, req.old_password, req.new_password)
    return ResponseSchema(message="密码修改成功")

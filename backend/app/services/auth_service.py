from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.user import User
from app.models.registration_request import RegistrationRequest
from app.core.security import hash_password, verify_password, create_access_token
from app.utils.enums import UserStatus, RegistrationStatus
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse
from app.services import audit_service, notification_service


def register_user(db: Session, req: RegisterRequest) -> User:
    if db.query(User).filter(User.username == req.username).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户名已存在")
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="邮箱已注册")

    user = User(
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name,
        phone=req.phone,
        department=req.department,
        employee_id=req.employee_id,
        remark=req.remark,
        status=UserStatus.PENDING,
    )
    db.add(user)
    db.flush()

    reg_request = RegistrationRequest(user_id=user.id)
    db.add(reg_request)
    db.flush()
    audit_service.log(
        db,
        user.id,
        "REGISTRATION_SUBMIT",
        "RegistrationRequest",
        reg_request.id,
        description=f"用户 {user.username} 提交注册申请",
        snapshot={"username": user.username, "email": user.email},
    )
    notification_service.notify_all_super_admins(
        db,
        title="新用户注册待审核",
        content=f"用户 {user.full_name}（{user.username}）提交了注册申请，请尽快审核。",
        notification_type="REGISTRATION",
        related_type="RegistrationRequest",
        related_id=reg_request.id,
    )
    db.commit()
    db.refresh(user)
    return user


def change_password(db: Session, user: "User", old_password: str, new_password: str):
    if not verify_password(old_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="原密码错误")
    if len(new_password) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="新密码长度不能少于6位")
    user.hashed_password = hash_password(new_password)
    audit_service.log(db, user.id, "CHANGE_PASSWORD", "User", user.id, description=f"用户 {user.username} 修改密码")
    db.commit()


def login_user(db: Session, req: LoginRequest) -> TokenResponse:
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")

    if user.status == UserStatus.DISABLED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已停用")

    access_token = create_access_token(data={"sub": str(user.id)})
    audit_service.log(db, user.id, "LOGIN_SUCCESS", "User", user.id, description=f"用户 {user.username} 登录成功")
    db.commit()
    return TokenResponse(access_token=access_token)

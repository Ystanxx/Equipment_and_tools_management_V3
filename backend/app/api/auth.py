from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse
from app.schemas.user import UserOut
from app.schemas.common import ResponseSchema
from app.services import auth_service

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

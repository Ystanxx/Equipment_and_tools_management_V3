import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.registration_request import RegistrationRequest
from app.models.user import User
from app.utils.enums import RegistrationStatus, UserStatus
from app.services import audit_service


def list_registration_requests(
    db: Session,
    status_filter: RegistrationStatus | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[RegistrationRequest], int]:
    query = db.query(RegistrationRequest)
    if status_filter:
        query = query.filter(RegistrationRequest.status == status_filter)
    query = query.order_by(RegistrationRequest.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return items, total


def approve_registration(db: Session, request_id: uuid.UUID, reviewer_id: uuid.UUID) -> RegistrationRequest:
    reg = db.query(RegistrationRequest).filter(RegistrationRequest.id == request_id).first()
    if not reg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="注册申请不存在")
    if reg.status != RegistrationStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该申请已处理")

    reg.status = RegistrationStatus.APPROVED
    reg.reviewer_id = reviewer_id
    reg.reviewed_at = datetime.now(timezone.utc)

    user = db.query(User).filter(User.id == reg.user_id).first()
    if user:
        user.status = UserStatus.ACTIVE

    audit_service.log(
        db,
        reviewer_id,
        "REGISTRATION_APPROVE",
        "RegistrationRequest",
        reg.id,
        description=f"通过注册申请 {reg.id}",
        snapshot={"user_id": str(reg.user_id)},
    )
    db.commit()
    db.refresh(reg)
    return reg


def reject_registration(
    db: Session, request_id: uuid.UUID, reviewer_id: uuid.UUID, reason: str | None = None
) -> RegistrationRequest:
    reg = db.query(RegistrationRequest).filter(RegistrationRequest.id == request_id).first()
    if not reg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="注册申请不存在")
    if reg.status != RegistrationStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该申请已处理")

    reg.status = RegistrationStatus.REJECTED
    reg.reviewer_id = reviewer_id
    reg.reject_reason = reason
    reg.reviewed_at = datetime.now(timezone.utc)

    audit_service.log(
        db,
        reviewer_id,
        "REGISTRATION_REJECT",
        "RegistrationRequest",
        reg.id,
        description=f"驳回注册申请 {reg.id}",
        snapshot={"user_id": str(reg.user_id), "reason": reason},
    )
    db.commit()
    db.refresh(reg)
    return reg

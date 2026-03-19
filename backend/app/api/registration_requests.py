import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_super_admin
from app.models.user import User
from app.schemas.registration import RegistrationRequestOut, RejectRequest
from app.schemas.common import ResponseSchema, PaginatedData
from app.services import registration_service
from app.utils.enums import RegistrationStatus

router = APIRouter(prefix="/registration-requests", tags=["注册审核"])


@router.get("", response_model=ResponseSchema[PaginatedData[RegistrationRequestOut]])
def list_requests(
    status: RegistrationStatus | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    items, total = registration_service.list_registration_requests(db, status, page, page_size)
    data = PaginatedData(
        items=[RegistrationRequestOut.model_validate(r) for r in items],
        total=total,
        page=page,
        page_size=page_size,
    )
    return ResponseSchema(data=data)


@router.post("/{request_id}/approve", response_model=ResponseSchema[RegistrationRequestOut])
def approve(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    reg = registration_service.approve_registration(db, request_id, current_user.id)
    return ResponseSchema(data=RegistrationRequestOut.model_validate(reg), message="审核通过")


@router.post("/{request_id}/reject", response_model=ResponseSchema[RegistrationRequestOut])
def reject(
    request_id: uuid.UUID,
    body: RejectRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    reason = body.reason if body else None
    reg = registration_service.reject_registration(db, request_id, current_user.id, reason)
    return ResponseSchema(data=RegistrationRequestOut.model_validate(reg), message="已驳回")

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_active_user
from app.models.user import User
from app.schemas.notification import NotificationOut
from app.schemas.common import ResponseSchema, PaginatedData
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["通知"])


@router.get("", summary="通知列表")
def list_notifications(
    page: int = 1,
    page_size: int = 20,
    is_read: bool | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    items, total = notification_service.list_notifications(
        db, user.id, is_read=is_read, page=page, page_size=page_size,
    )
    out = [NotificationOut.model_validate(n) for n in items]
    return ResponseSchema(data=PaginatedData(items=out, total=total, page=page, page_size=page_size))


@router.get("/unread-count", summary="未读通知数")
def unread_count(
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    count = notification_service.get_unread_count(db, user.id)
    return ResponseSchema(data={"count": count})


@router.post("/{notification_id}/read", summary="标记已读")
def mark_read(
    notification_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    n = notification_service.mark_as_read(db, notification_id, user)
    return ResponseSchema(data=NotificationOut.model_validate(n))


@router.post("/read-all", summary="全部已读")
def mark_all_read(
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    count = notification_service.mark_all_as_read(db, user)
    return ResponseSchema(data={"count": count})

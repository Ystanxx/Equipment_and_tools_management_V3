"""In-app + email notification service.

Creates notifications for key business events and provides
query helpers for the notification center UI.  Optionally sends
email via SMTP when ``enable_email_notifications`` is enabled.
"""
import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.user import User
from app.services import system_config_service
from app.utils.enums import UserRole

logger = logging.getLogger(__name__)


def _should_send_email(db: Session) -> bool:
    try:
        return bool(system_config_service.get_config_value(db, "enable_email_notifications"))
    except Exception:
        return False


def _try_send_email(db: Session, recipient_id: uuid.UUID, title: str, content: str):
    """Best-effort email send — failures are logged, never raised."""
    if not _should_send_email(db):
        return
    try:
        recipient = db.query(User).filter(User.id == recipient_id).first()
        if not recipient or not recipient.email or not recipient.email_notifications_enabled:
            return
        from app.services.email_service import send_notification_email
        send_notification_email(recipient.email, title, content)
    except Exception:
        logger.exception("Failed to send notification email to user %s", recipient_id)


def create(
    db: Session,
    *,
    recipient_id: uuid.UUID,
    title: str,
    content: str,
    notification_type: str,
    related_type: str | None = None,
    related_id: uuid.UUID | None = None,
) -> Notification | None:
    """Create a notification if in-app notifications are enabled."""
    try:
        enabled = system_config_service.get_config_value(db, "enable_in_app_notifications")
        if not enabled:
            _try_send_email(db, recipient_id, title, content)
            return None
    except Exception:
        pass

    n = Notification(
        recipient_id=recipient_id,
        title=title,
        content=content,
        notification_type=notification_type,
        related_type=related_type,
        related_id=related_id,
    )
    db.add(n)

    _try_send_email(db, recipient_id, title, content)
    return n


def notify_all_super_admins(
    db: Session,
    *,
    title: str,
    content: str,
    notification_type: str,
    related_type: str | None = None,
    related_id: uuid.UUID | None = None,
) -> list[Notification]:
    """Send a notification to every SUPER_ADMIN."""
    admins = db.query(User).filter(User.role == UserRole.SUPER_ADMIN, User.status == "ACTIVE").all()
    results = []
    for admin in admins:
        n = create(
            db,
            recipient_id=admin.id,
            title=title,
            content=content,
            notification_type=notification_type,
            related_type=related_type,
            related_id=related_id,
        )
        if n:
            results.append(n)
    return results


def list_notifications(
    db: Session,
    user_id: uuid.UUID,
    *,
    is_read: bool | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Notification], int]:
    q = db.query(Notification).filter(Notification.recipient_id == user_id)
    if is_read is not None:
        q = q.filter(Notification.is_read == is_read)
    total = q.count()
    items = q.order_by(Notification.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return items, total


def get_unread_count(db: Session, user_id: uuid.UUID) -> int:
    return db.query(Notification).filter(
        Notification.recipient_id == user_id,
        Notification.is_read == False,  # noqa: E712
    ).count()


def mark_as_read(db: Session, notification_id: uuid.UUID, user: User) -> Notification:
    n = db.query(Notification).filter(Notification.id == notification_id).first()
    if not n or n.recipient_id != user.id:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="通知不存在")
    n.is_read = True
    db.commit()
    db.refresh(n)
    return n


def mark_all_as_read(db: Session, user: User) -> int:
    count = db.query(Notification).filter(
        Notification.recipient_id == user.id,
        Notification.is_read == False,  # noqa: E712
    ).update({"is_read": True})
    db.commit()
    return count

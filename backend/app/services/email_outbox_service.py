"""Transactional outbox with leases; SMTP runs after releasing business locks."""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_
from app.core.database import SessionLocal
from app.models.email_outbox import EmailOutbox
from app.models.user import User
from app.services import email_service, system_config_service
from app.utils.enums import UserStatus

logger = logging.getLogger(__name__)
MAX_ATTEMPTS = 6


def enqueue(db, recipient_id, title, content):
    if not system_config_service.get_config_value(db, 'enable_email_notifications'):
        return
    recipient = db.get(User, recipient_id)
    if recipient and recipient.email and recipient.email_notifications_enabled and recipient.status == UserStatus.ACTIVE:
        db.add(EmailOutbox(recipient_id=recipient.id, title=title, content=content))


def drain_outbox(session_factory=SessionLocal, limit=10):
    processed = 0
    for _ in range(limit):
        now = datetime.now(timezone.utc)
        with session_factory() as db:
            entry = db.query(EmailOutbox).filter(
                EmailOutbox.sent_at.is_(None), EmailOutbox.attempts < MAX_ATTEMPTS,
                EmailOutbox.next_attempt_at <= now,
                or_(EmailOutbox.locked_until.is_(None), EmailOutbox.locked_until < now),
            ).order_by(EmailOutbox.next_attempt_at, EmailOutbox.id).with_for_update(skip_locked=True).first()
            if not entry:
                return processed
            entry.attempts += 1
            entry.lease_token = uuid.uuid4()
            entry.locked_until = now + timedelta(minutes=5)
            entry_id, lease, attempt = entry.id, entry.lease_token, entry.attempts
            recipient_id, title, content = entry.recipient_id, entry.title, entry.content
            db.commit()
        success, error = False, 'smtp_send_failed'
        try:
            with session_factory() as db:
                recipient = db.get(User, recipient_id)
                enabled = system_config_service.get_config_value(db, 'enable_email_notifications')
                if not enabled or not recipient or recipient.status != UserStatus.ACTIVE or not recipient.email_notifications_enabled:
                    success, error = True, 'disabled_before_delivery'
                else:
                    success = email_service.send_notification_email(recipient.email, title, content, db=db)
        except Exception:
            logger.exception('Outbox delivery failed: %s', entry_id)
        with session_factory() as db:
            values = {'lease_token': None, 'locked_until': None, 'last_error': None if success and error == 'smtp_send_failed' else error}
            if success:
                values['sent_at'] = datetime.now(timezone.utc)
            else:
                values['next_attempt_at'] = datetime.now(timezone.utc) + timedelta(seconds=min(3600, 30 * 2 ** attempt))
                if attempt >= MAX_ATTEMPTS:
                    logger.error('Outbox exhausted retries: %s', entry_id)
            db.query(EmailOutbox).filter(EmailOutbox.id == entry_id, EmailOutbox.lease_token == lease).update(values)
            db.commit()
        processed += 1
    return processed

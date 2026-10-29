from datetime import datetime, timedelta, timezone
from threading import Barrier
from concurrent.futures import ThreadPoolExecutor

from app.models.email_outbox import EmailOutbox
from app.models.user import User
from app.services import email_service, notification_service
from app.services.email_outbox_service import drain_outbox
from tests.conftest import TestSession


def test_outbox_commit_rollback_retry_and_concurrent_claim(client, db, auth_headers, monkeypatch):
    user = db.query(User).filter(User.username == 'admin_test').one()
    client.put('/api/v1/system-configs', headers=auth_headers, json={'values': {'enable_email_notifications': True}})
    sent = []
    def deliver(email, title, content, **kwargs):
        sent.append(title)
        return True
    monkeypatch.setattr(email_service, 'send_notification_email', deliver)
    notification_service.create(db, recipient_id=user.id, title='rollback', content='fixture', notification_type='SYSTEM')
    db.flush()
    assert drain_outbox(TestSession) == 0 and sent == []
    db.rollback()
    assert db.query(EmailOutbox).count() == 0
    notification_service.create(db, recipient_id=user.id, title='committed', content='fixture', notification_type='SYSTEM')
    db.commit()
    assert sent == []  # SMTP is never called inside the business transaction.
    monkeypatch.setattr(email_service, 'send_notification_email', lambda *a, **k: False)
    assert drain_outbox(TestSession) == 1
    db.expire_all()
    entry = db.query(EmailOutbox).one()
    assert entry.attempts == 1 and entry.sent_at is None and entry.last_error == 'smtp_send_failed'
    entry.next_attempt_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    monkeypatch.setattr(email_service, 'send_notification_email', deliver)
    barrier = Barrier(2)
    def drain(_):
        barrier.wait(timeout=10)
        return drain_outbox(TestSession)
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sum(pool.map(drain, range(2))) == 1
    assert sent == ['committed']
    db.expire_all()
    assert db.query(EmailOutbox).one().sent_at is not None

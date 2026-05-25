"""Tests for the photo cleanup service."""
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from app.models.attachment import Attachment
from app.models.user import User
from app.core.security import hash_password
from app.services import photo_cleanup_service
from app.utils.enums import PhotoType, UserRole, UserStatus


def _ensure_user(db):
    """Create a real user for FK constraints and return their id."""
    user = db.query(User).filter(User.username == "cleanup_user").first()
    if not user:
        user = User(
            username="cleanup_user",
            email="cleanup@test.com",
            hashed_password=hash_password("testpass"),
            full_name="Cleanup User",
            role=UserRole.USER,
            status=UserStatus.ACTIVE,
        )
        db.add(user)
        db.flush()
    return user.id


def _make_attachment(db, photo_type, related_id, days_ago=0, uploader_id=None):
    att = Attachment(
        photo_type=photo_type,
        related_type="Asset" if photo_type == PhotoType.INVENTORY else "BorrowOrder",
        related_id=related_id,
        file_path=f"test/{uuid.uuid4()}.jpg",
        thumb_path=f"test/thumb_{uuid.uuid4()}.jpg",
        uploaded_by=uploader_id,
        created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
    )
    db.add(att)
    db.flush()
    return att


def test_cleanup_inventory_keeps_recent(db):
    """Inventory cleanup keeps only N most recent photos per asset."""
    user_id = _ensure_user(db)
    asset_id = uuid.uuid4()
    # Create 7 inventory photos
    atts = [_make_attachment(db, PhotoType.INVENTORY, asset_id, days_ago=i, uploader_id=user_id) for i in range(7)]
    db.commit()

    keep_count = 5
    with patch.object(photo_cleanup_service, "system_config_service") as mock_cfg:
        mock_cfg.get_config_value.side_effect = lambda db, key: {
            "photo_cleanup_enabled": True,
            "inventory_photo_keep_count": keep_count,
            "borrow_photo_keep_days": 180,
            "return_photo_keep_days": 365,
            "incident_photo_keep_days": 365,
        }[key]

        deleted = photo_cleanup_service._cleanup_inventory(db, Path("/tmp/nonexist"))
        db.commit()

    assert deleted == 2
    remaining = db.query(Attachment).filter(
        Attachment.photo_type == PhotoType.INVENTORY,
        Attachment.related_id == asset_id,
    ).count()
    assert remaining == keep_count


def test_cleanup_by_age_deletes_old(db):
    """Age-based cleanup deletes photos older than retention period."""
    user_id = _ensure_user(db)
    order_id = uuid.uuid4()
    _make_attachment(db, PhotoType.BORROW_ORDER, order_id, days_ago=200, uploader_id=user_id)  # old
    _make_attachment(db, PhotoType.BORROW_ORDER, order_id, days_ago=10, uploader_id=user_id)   # recent
    db.commit()

    with patch.object(photo_cleanup_service, "system_config_service") as mock_cfg:
        mock_cfg.get_config_value.return_value = 180  # keep_days

        deleted = photo_cleanup_service._cleanup_by_age(
            db, Path("/tmp/nonexist"), PhotoType.BORROW_ORDER, "borrow_photo_keep_days"
        )
        db.commit()

    assert deleted == 1
    remaining = db.query(Attachment).filter(Attachment.related_id == order_id).count()
    assert remaining == 1


def test_cleanup_disabled_skips(db):
    """When photo_cleanup_enabled is False, cleanup does nothing."""
    user_id = _ensure_user(db)
    order_id = uuid.uuid4()
    _make_attachment(db, PhotoType.BORROW_ORDER, order_id, days_ago=9999, uploader_id=user_id)
    db.commit()

    with patch.object(photo_cleanup_service, "system_config_service") as mock_cfg:
        mock_cfg.get_config_value.side_effect = lambda db, key: {
            "photo_cleanup_enabled": False,
        }.get(key, 180)

        with patch.object(photo_cleanup_service, "SessionLocal", return_value=db):
            photo_cleanup_service.run_cleanup()

    remaining = db.query(Attachment).filter(Attachment.related_id == order_id).count()
    assert remaining == 1

"""Scheduled photo cleanup service.

Deletes expired attachment records and their physical files based on
system configuration values:
  - INVENTORY: keep only `inventory_photo_keep_count` most recent per asset
  - BORROW_ORDER: delete after `borrow_photo_keep_days` days
  - RETURN_ITEM: delete after `return_photo_keep_days` days
  - INCIDENT: delete after `incident_photo_keep_days` days
  - Controlled by `photo_cleanup_enabled` config toggle
"""
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.attachment import Attachment
from app.services import system_config_service
from app.utils.enums import PhotoType

logger = logging.getLogger(__name__)


def _delete_files(upload_dir: Path, attachment: Attachment):
    """Remove physical files (standard + thumbnail) from disk."""
    for rel_path in (attachment.file_path, attachment.thumb_path):
        if not rel_path:
            continue
        full = upload_dir / rel_path
        try:
            if full.exists():
                full.unlink()
                logger.debug("Deleted file: %s", full)
        except Exception:
            logger.exception("Failed to delete file: %s", full)


def run_cleanup():
    """Execute one cleanup cycle — called by APScheduler."""
    db: Session = SessionLocal()
    upload_dir = Path(settings.UPLOAD_DIR).resolve()
    try:
        enabled = system_config_service.get_config_value(db, "photo_cleanup_enabled")
        if not enabled:
            logger.info("Photo cleanup is disabled, skipping.")
            return

        total_deleted = 0
        total_deleted += _cleanup_inventory(db, upload_dir)
        total_deleted += _cleanup_by_age(db, upload_dir, PhotoType.BORROW_ORDER, "borrow_photo_keep_days")
        total_deleted += _cleanup_by_age(db, upload_dir, PhotoType.RETURN_ITEM, "return_photo_keep_days")
        total_deleted += _cleanup_by_age(db, upload_dir, PhotoType.INCIDENT, "incident_photo_keep_days")

        if total_deleted > 0:
            db.commit()
            logger.info("Photo cleanup completed: %d attachments deleted.", total_deleted)
        else:
            logger.info("Photo cleanup completed: nothing to delete.")
    except Exception:
        db.rollback()
        logger.exception("Photo cleanup failed.")
    finally:
        db.close()


def _cleanup_inventory(db: Session, upload_dir: Path) -> int:
    """Keep only the N most recent inventory photos per asset."""
    keep_count = system_config_service.get_config_value(db, "inventory_photo_keep_count")
    deleted = 0

    # Find assets that have more inventory photos than the keep count
    asset_counts = (
        db.query(Attachment.related_id, func.count(Attachment.id).label("cnt"))
        .filter(Attachment.photo_type == PhotoType.INVENTORY)
        .group_by(Attachment.related_id)
        .having(func.count(Attachment.id) > keep_count)
        .all()
    )

    for asset_id, cnt in asset_counts:
        # Get the IDs to keep (most recent N)
        keep_ids = [
            row[0] for row in
            db.query(Attachment.id)
            .filter(Attachment.photo_type == PhotoType.INVENTORY, Attachment.related_id == asset_id)
            .order_by(Attachment.created_at.desc())
            .limit(keep_count)
            .all()
        ]

        # Delete the rest
        to_delete = (
            db.query(Attachment)
            .filter(
                Attachment.photo_type == PhotoType.INVENTORY,
                Attachment.related_id == asset_id,
                ~Attachment.id.in_(keep_ids),
            )
            .all()
        )

        for att in to_delete:
            _delete_files(upload_dir, att)
            db.delete(att)
            deleted += 1

    return deleted


def _cleanup_by_age(db: Session, upload_dir: Path, photo_type: PhotoType, config_key: str) -> int:
    """Delete attachments older than the configured retention days."""
    keep_days = system_config_service.get_config_value(db, config_key)
    cutoff = datetime.now(timezone.utc) - timedelta(days=keep_days)
    deleted = 0

    to_delete = (
        db.query(Attachment)
        .filter(Attachment.photo_type == photo_type, Attachment.created_at < cutoff)
        .all()
    )

    for att in to_delete:
        _delete_files(upload_dir, att)
        db.delete(att)
        deleted += 1

    return deleted

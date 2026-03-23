import io
import json
import logging
import shutil
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException, status
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.models.asset import Asset
from app.models.attachment import Attachment
from app.models.borrow_order import BorrowOrder
from app.models.return_order_item import ReturnOrderItem
from app.models.user import User
from app.services import audit_service, system_config_service
from app.utils.enums import PhotoType, UserRole

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
STAGING_DIR = UPLOAD_DIR / "_staging"
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
FORMAT_EXTENSION = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}
FORMAT_MIME = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
MAX_IMAGE_PIXELS = 60_000_000
STAGED_ATTACHMENT_EXPIRE_MINUTES = 10

logger = logging.getLogger(__name__)


@dataclass
class ProcessedImage:
    content: bytes
    thumb_content: bytes
    extension: str
    mime_type: str


@dataclass
class StagedAttachment:
    token: str
    photo_type: str
    file_path: str
    thumb_path: str
    original_filename: str | None
    file_size: int
    mime_type: str


def discard_staged_attachment(stage_token: str, user: User) -> None:
    staged_meta = _load_staged_attachment(stage_token)
    if staged_meta["uploaded_by"] != str(user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除该临时附件")
    _cleanup_staged_attachment(stage_token)


def cleanup_expired_staged_attachments(expire_minutes: int = STAGED_ATTACHMENT_EXPIRE_MINUTES) -> int:
    if not STAGING_DIR.exists():
        return 0

    cleaned = 0
    expire_before = datetime.now(timezone.utc) - timedelta(minutes=expire_minutes)
    for metadata_path in STAGING_DIR.glob("*.json"):
        token = metadata_path.stem
        try:
            meta = json.loads(metadata_path.read_text(encoding="utf-8"))
            created_at = _parse_stage_created_at(meta)
        except (json.JSONDecodeError, ValueError):
            logger.warning("检测到损坏的临时附件元数据，已清理: %s", metadata_path.name)
            _cleanup_staged_attachment(token)
            cleaned += 1
            continue

        if created_at <= expire_before:
            _cleanup_staged_attachment(token)
            cleaned += 1

    return cleaned


def create_attachment(
    db: Session,
    *,
    file_bytes: bytes,
    content_type: str | None,
    original_filename: str | None,
    photo_type: PhotoType,
    related_type: str,
    related_id: uuid.UUID,
    user: User,
) -> Attachment:
    _validate_upload_context(db, photo_type, related_type, related_id, user)
    if content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"不支持的文件类型: {content_type}")
    _validate_file_size(db, file_bytes)

    processed = _process_image(db, file_bytes)
    now = datetime.now(timezone.utc)
    sub_dir = UPLOAD_DIR / photo_type.value / now.strftime("%Y-%m")
    sub_dir.mkdir(parents=True, exist_ok=True)

    file_id = uuid.uuid4()
    filename = f"{file_id}{processed.extension}"
    thumb_filename = f"{file_id}_thumb{processed.extension}"
    (sub_dir / filename).write_bytes(processed.content)
    (sub_dir / thumb_filename).write_bytes(processed.thumb_content)

    attachment = Attachment(
        photo_type=photo_type,
        related_type=related_type,
        related_id=related_id,
        file_path=_to_relative_path(photo_type, now, filename),
        thumb_path=_to_relative_path(photo_type, now, thumb_filename),
        original_filename=original_filename,
        file_size=len(processed.content),
        mime_type=processed.mime_type,
        uploaded_by=user.id,
    )
    db.add(attachment)
    db.flush()

    audit_service.log(
        db,
        user.id,
        "ATTACHMENT_UPLOAD",
        "Attachment",
        attachment.id,
        description=f"上传{photo_type.value}图片",
        snapshot={
            "photo_type": photo_type.value,
            "related_type": related_type,
            "related_id": str(related_id),
        },
    )
    db.commit()
    db.refresh(attachment)
    return attachment


def stage_attachment(
    db: Session,
    *,
    file_bytes: bytes,
    content_type: str | None,
    original_filename: str | None,
    photo_type: PhotoType,
    user: User,
) -> StagedAttachment:
    cleanup_expired_staged_attachments()
    if content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"不支持的文件类型: {content_type}")
    _validate_file_size(db, file_bytes)

    processed = _process_image(db, file_bytes)
    STAGING_DIR.mkdir(parents=True, exist_ok=True)

    token = str(uuid.uuid4())
    filename = f"{token}{processed.extension}"
    thumb_filename = f"{token}_thumb{processed.extension}"
    metadata_filename = f"{token}.json"

    (STAGING_DIR / filename).write_bytes(processed.content)
    (STAGING_DIR / thumb_filename).write_bytes(processed.thumb_content)
    (STAGING_DIR / metadata_filename).write_text(json.dumps({
        "token": token,
        "photo_type": photo_type.value,
        "file_path": filename,
        "thumb_path": thumb_filename,
        "original_filename": original_filename,
        "file_size": len(processed.content),
        "mime_type": processed.mime_type,
        "uploaded_by": str(user.id),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }, ensure_ascii=False), encoding="utf-8")

    return StagedAttachment(
        token=token,
        photo_type=photo_type.value,
        file_path=f"_staging/{filename}",
        thumb_path=f"_staging/{thumb_filename}",
        original_filename=original_filename,
        file_size=len(processed.content),
        mime_type=processed.mime_type,
    )


def finalize_staged_attachment(
    db: Session,
    *,
    stage_token: str,
    related_type: str,
    related_id: uuid.UUID,
    user: User,
) -> Attachment:
    staged_meta = _load_staged_attachment(stage_token)
    if _is_staged_attachment_expired(staged_meta):
        _cleanup_staged_attachment(stage_token)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="临时附件已过期，请重新上传")
    if staged_meta["uploaded_by"] != str(user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权使用该临时附件")

    try:
        photo_type = PhotoType(staged_meta["photo_type"])
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="临时附件类型无效") from exc

    _validate_upload_context(db, photo_type, related_type, related_id, user)

    now = datetime.now(timezone.utc)
    sub_dir = UPLOAD_DIR / photo_type.value / now.strftime("%Y-%m")
    sub_dir.mkdir(parents=True, exist_ok=True)

    temp_file = STAGING_DIR / staged_meta["file_path"]
    temp_thumb_file = STAGING_DIR / staged_meta["thumb_path"]
    if not temp_file.exists() or not temp_thumb_file.exists():
        _cleanup_staged_attachment(stage_token)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="临时附件已失效，请重新上传")

    file_id = uuid.uuid4()
    extension = Path(staged_meta["file_path"]).suffix
    filename = f"{file_id}{extension}"
    thumb_filename = f"{file_id}_thumb{extension}"
    shutil.move(str(temp_file), str(sub_dir / filename))
    shutil.move(str(temp_thumb_file), str(sub_dir / thumb_filename))

    attachment = Attachment(
        photo_type=photo_type,
        related_type=related_type,
        related_id=related_id,
        file_path=_to_relative_path(photo_type, now, filename),
        thumb_path=_to_relative_path(photo_type, now, thumb_filename),
        original_filename=staged_meta.get("original_filename"),
        file_size=staged_meta.get("file_size"),
        mime_type=staged_meta.get("mime_type"),
        uploaded_by=user.id,
    )
    db.add(attachment)
    db.flush()

    audit_service.log(
        db,
        user.id,
        "ATTACHMENT_UPLOAD",
        "Attachment",
        attachment.id,
        description=f"上传{photo_type.value}图片",
        snapshot={
            "photo_type": photo_type.value,
            "related_type": related_type,
            "related_id": str(related_id),
            "stage_token": stage_token,
        },
    )
    db.commit()
    db.refresh(attachment)
    _cleanup_staged_attachment(stage_token)
    return attachment


def _validate_file_size(db: Session, file_bytes: bytes) -> None:
    max_mb = int(system_config_service.get_config_value(db, "photo_max_upload_mb"))
    if len(file_bytes) > max_mb * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"文件大小超过 {max_mb}MB 限制")


def _process_image(db: Session, file_bytes: bytes) -> ProcessedImage:
    target_format = str(system_config_service.get_config_value(db, "photo_target_format")).upper()
    standard_max_edge = int(system_config_service.get_config_value(db, "photo_standard_max_edge"))
    standard_quality = int(system_config_service.get_config_value(db, "photo_standard_quality"))
    thumb_max_edge = int(system_config_service.get_config_value(db, "photo_thumb_max_edge"))

    try:
        with Image.open(io.BytesIO(file_bytes)) as image:
            width, height = image.size
            if width * height > MAX_IMAGE_PIXELS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="图片分辨率过高，请压缩后重新上传",
                )
            normalized = ImageOps.exif_transpose(image)
            standard_image = _resize_image(normalized, standard_max_edge)
            thumb_image = _resize_image(standard_image, thumb_max_edge)
            standard_image = _prepare_for_format(standard_image, target_format)
            thumb_image = _prepare_for_format(thumb_image, target_format)
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        logger.warning("图片处理失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="图片文件损坏、编码异常或格式不受支持",
        ) from exc

    return ProcessedImage(
        content=_save_image_bytes(standard_image, target_format, standard_quality),
        thumb_content=_save_image_bytes(thumb_image, target_format, standard_quality),
        extension=FORMAT_EXTENSION[target_format],
        mime_type=FORMAT_MIME[target_format],
    )


def _resize_image(image: Image.Image, max_edge: int) -> Image.Image:
    working = image.copy()
    working.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    return working


def _prepare_for_format(image: Image.Image, target_format: str) -> Image.Image:
    if target_format == "JPEG":
        if image.mode not in ("RGB", "L"):
            background = Image.new("RGB", image.size, "white")
            alpha_image = image.convert("RGBA")
            background.paste(alpha_image, mask=alpha_image.split()[-1])
            return background
        return image.convert("RGB")

    if image.mode not in ("RGB", "RGBA"):
        return image.convert("RGBA" if "A" in image.mode else "RGB")
    return image


def _save_image_bytes(image: Image.Image, target_format: str, quality: int) -> bytes:
    payload = io.BytesIO()
    save_kwargs = {"format": target_format}
    if target_format in {"JPEG", "WEBP"}:
        save_kwargs["quality"] = quality
    if target_format == "PNG":
        save_kwargs["compress_level"] = 6
    image.save(payload, **save_kwargs)
    return payload.getvalue()


def _validate_upload_context(
    db: Session,
    photo_type: PhotoType,
    related_type: str,
    related_id: uuid.UUID,
    user: User,
) -> None:
    if photo_type == PhotoType.INVENTORY:
        if related_type != "Asset":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="库存照片必须关联到设备")
        asset = db.query(Asset).filter(Asset.id == related_id).first()
        if not asset:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="关联设备不存在")
        if user.role not in (UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权上传库存照片")
        if user.role == UserRole.ASSET_ADMIN and asset.admin_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能为自己负责的设备上传库存照片")
        return

    if photo_type == PhotoType.BORROW_ORDER:
        if related_type != "BorrowOrder":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="借出照片必须关联到借用单")
        order = db.query(BorrowOrder).filter(BorrowOrder.id == related_id).first()
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="关联借用单不存在")
        if order.applicant_id != user.id and user.role not in (UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权为该借用单上传照片")
        return

    if photo_type == PhotoType.RETURN_ITEM:
        if related_type != "ReturnOrderItem":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="归还照片必须关联到归还明细")
        item = db.query(ReturnOrderItem).filter(ReturnOrderItem.id == related_id).first()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="关联归还明细不存在")
        applicant_id = item.order.applicant_id if item.order else None
        if applicant_id != user.id and user.role not in (UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权为该归还明细上传照片")
        return

    if related_type not in {"Asset", "BorrowOrder", "ReturnOrderItem"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的关联对象类型")


def _to_relative_path(photo_type: PhotoType, now: datetime, filename: str) -> str:
    return f"{photo_type.value}/{now.strftime('%Y-%m')}/{filename}"


def _load_staged_attachment(stage_token: str) -> dict:
    metadata_path = STAGING_DIR / f"{stage_token}.json"
    if not metadata_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="临时附件不存在或已过期")
    try:
        return json.loads(metadata_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="临时附件元数据损坏") from exc


def _cleanup_staged_attachment(stage_token: str) -> None:
    for path in (
        STAGING_DIR / f"{stage_token}.json",
        *STAGING_DIR.glob(f"{stage_token}.*"),
        *STAGING_DIR.glob(f"{stage_token}_thumb.*"),
    ):
        if path.exists():
            path.unlink(missing_ok=True)


def _parse_stage_created_at(staged_meta: dict) -> datetime:
    created_at = staged_meta.get("created_at")
    if not created_at:
        raise ValueError("missing created_at")
    parsed = datetime.fromisoformat(created_at)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _is_staged_attachment_expired(staged_meta: dict, expire_minutes: int = STAGED_ATTACHMENT_EXPIRE_MINUTES) -> bool:
    created_at = _parse_stage_created_at(staged_meta)
    expire_before = datetime.now(timezone.utc) - timedelta(minutes=expire_minutes)
    return created_at <= expire_before

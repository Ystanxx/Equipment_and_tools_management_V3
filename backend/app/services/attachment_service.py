import io
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
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
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
FORMAT_EXTENSION = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}
FORMAT_MIME = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


@dataclass
class ProcessedImage:
    content: bytes
    thumb_content: bytes
    extension: str
    mime_type: str


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
            normalized = ImageOps.exif_transpose(image)
            standard_image = _prepare_for_format(_resize_image(normalized.copy(), standard_max_edge), target_format)
            thumb_image = _prepare_for_format(_resize_image(normalized.copy(), thumb_max_edge), target_format)
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无法识别的图片文件") from exc

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
        save_kwargs["optimize"] = True
    if target_format == "PNG":
        save_kwargs["optimize"] = True
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

import uuid

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_active_user
from app.models.attachment import Attachment
from app.models.user import User
from app.schemas.common import ResponseSchema
from app.services import attachment_service
from app.utils.enums import PhotoType

router = APIRouter(prefix="/attachments", tags=["附件"])


@router.post("", summary="上传附件")
async def upload_attachment(
    file: UploadFile = File(...),
    photo_type: str = Form(...),
    related_type: str = Form(...),
    related_id: str = Form(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    try:
        pt = PhotoType(photo_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"无效的 photo_type: {photo_type}")

    content = await file.read()
    rid = uuid.UUID(related_id)
    att = attachment_service.create_attachment(
        db,
        file_bytes=content,
        content_type=file.content_type,
        original_filename=file.filename,
        photo_type=pt,
        related_type=related_type,
        related_id=rid,
        user=user,
    )

    return ResponseSchema(data={
        "id": str(att.id),
        "file_path": att.file_path,
        "thumb_path": att.thumb_path,
        "original_filename": att.original_filename,
        "file_size": att.file_size,
        "mime_type": att.mime_type,
    })


@router.post("/stage", summary="暂存附件")
async def stage_attachment(
    file: UploadFile = File(...),
    photo_type: str = Form(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    try:
        pt = PhotoType(photo_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"无效的 photo_type: {photo_type}")

    content = await file.read()
    staged = attachment_service.stage_attachment(
        db,
        file_bytes=content,
        content_type=file.content_type,
        original_filename=file.filename,
        photo_type=pt,
        user=user,
    )
    return ResponseSchema(data={
        "stage_token": staged.token,
        "photo_type": staged.photo_type,
        "file_path": staged.file_path,
        "thumb_path": staged.thumb_path,
        "original_filename": staged.original_filename,
        "file_size": staged.file_size,
        "mime_type": staged.mime_type,
    })


@router.post("/finalize", summary="确认附件上传")
def finalize_attachment(
    stage_token: str = Form(...),
    related_type: str = Form(...),
    related_id: str = Form(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    att = attachment_service.finalize_staged_attachment(
        db,
        stage_token=stage_token,
        related_type=related_type,
        related_id=uuid.UUID(related_id),
        user=user,
    )
    return ResponseSchema(data={
        "id": str(att.id),
        "file_path": att.file_path,
        "thumb_path": att.thumb_path,
        "original_filename": att.original_filename,
        "file_size": att.file_size,
        "mime_type": att.mime_type,
    })


@router.delete("/stage/{stage_token}", summary="删除临时附件")
def delete_staged_attachment(
    stage_token: str,
    user: User = Depends(get_active_user),
):
    attachment_service.discard_staged_attachment(stage_token, user)
    return ResponseSchema(data=True)


@router.get("", summary="查询附件列表")
def list_attachments(
    related_type: str | None = None,
    related_id: str | None = None,
    photo_type: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    q = db.query(Attachment)
    if related_type:
        q = q.filter(Attachment.related_type == related_type)
    if related_id:
        q = q.filter(Attachment.related_id == uuid.UUID(related_id))
    if photo_type:
        q = q.filter(Attachment.photo_type == photo_type)
    items = q.order_by(Attachment.created_at.desc()).limit(100).all()

    return ResponseSchema(data=[
        {
            "id": str(a.id),
            "photo_type": a.photo_type.value if hasattr(a.photo_type, "value") else a.photo_type,
            "related_type": a.related_type,
            "related_id": str(a.related_id),
            "file_path": a.file_path,
            "thumb_path": a.thumb_path,
            "original_filename": a.original_filename,
            "file_size": a.file_size,
            "mime_type": a.mime_type,
            "created_at": a.created_at.isoformat(),
        }
        for a in items
    ])

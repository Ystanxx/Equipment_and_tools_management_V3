import uuid
from pathlib import Path
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_active_user
from app.models.attachment import Attachment
from app.models.user import User
from app.schemas.common import ResponseSchema
from app.utils.enums import PhotoType

router = APIRouter(prefix="/attachments", tags=["附件"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("", summary="上传附件")
async def upload_attachment(
    file: UploadFile = File(...),
    photo_type: str = Form(...),
    related_type: str = Form(...),
    related_id: str = Form(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_active_user),
):
    # 校验 photo_type
    try:
        pt = PhotoType(photo_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"无效的 photo_type: {photo_type}")

    # 校验文件类型
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型: {file.content_type}")

    # 读取并检查大小
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="文件大小超过 10MB 限制")

    # 目录结构: uploads/{photo_type}/{YYYY-MM}/{uuid}.ext
    now = datetime.now(timezone.utc)
    sub_dir = UPLOAD_DIR / pt.value / now.strftime("%Y-%m")
    sub_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename).suffix.lower() if file.filename else ".jpg"
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        ext = ".jpg"
    file_id = uuid.uuid4()
    filename = f"{file_id}{ext}"
    file_path = sub_dir / filename

    with open(file_path, "wb") as f:
        f.write(content)

    # 相对路径存库
    rel_path = f"{pt.value}/{now.strftime('%Y-%m')}/{filename}"

    rid = uuid.UUID(related_id)
    att = Attachment(
        photo_type=pt,
        related_type=related_type,
        related_id=rid,
        file_path=rel_path,
        original_filename=file.filename,
        file_size=len(content),
        mime_type=file.content_type,
        uploaded_by=user.id,
    )
    db.add(att)
    db.commit()
    db.refresh(att)

    return ResponseSchema(data={
        "id": str(att.id),
        "file_path": rel_path,
        "original_filename": att.original_filename,
        "file_size": att.file_size,
    })


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
            "original_filename": a.original_filename,
            "file_size": a.file_size,
            "created_at": a.created_at.isoformat(),
        }
        for a in items
    ])

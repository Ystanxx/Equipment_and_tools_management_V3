"""Short-lived, path-specific links; never put login tokens into image URLs."""
import hashlib
import hmac
import time
import uuid
from urllib.parse import urlencode

from fastapi import HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import or_

from app.core.config import settings
from app.core.deps import get_active_user, get_current_user
from app.models.attachment import Attachment
from app.models.user import User
from app.services import attachment_service
from app.services.access_service import require_attachment_context
from app.utils.enums import PhotoType, UserStatus


def _signature(path, user_id, expires):
    message = f"attachment:{path}:{user_id}:{expires}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def image_path(path, user):
    if not path or path.startswith("INVENTORY/"):
        return path
    expires = int(time.time()) + 900
    return path + "?" + urlencode({"viewer": str(user.id), "expires": expires,
                                   "signature": _signature(path, user.id, expires)})


def serve_image(path, request, db):
    root = attachment_service.UPLOAD_DIR.resolve()
    target = (root / path).resolve()
    if not target.is_relative_to(root) or not target.is_file():
        raise HTTPException(404, "图片不存在")
    attachment = db.query(Attachment).filter(or_(
        Attachment.file_path == path, Attachment.thumb_path == path)).first()
    if not attachment:
        raise HTTPException(404, "图片不存在或尚未提交")
    if attachment.photo_type != PhotoType.INVENTORY:
        authorization = request.headers.get("authorization", "")
        if authorization.lower().startswith("bearer "):
            user = get_active_user(get_current_user(authorization[7:], db))
        else:
            params = request.query_params
            try:
                viewer = uuid.UUID(params.get("viewer", ""))
                expires = int(params.get("expires", "0"))
            except ValueError:
                raise HTTPException(401, "图片链接无效")
            expected = _signature(path, viewer, expires)
            if expires <= time.time() or not hmac.compare_digest(expected, params.get("signature", "")):
                raise HTTPException(401, "图片链接已过期，请刷新页面")
            user = db.get(User, viewer)
            if not user or user.status != UserStatus.ACTIVE:
                raise HTTPException(403, "账号不可用")
        require_attachment_context(db, attachment.related_type, attachment.related_id, user)
    return FileResponse(target, media_type=attachment.mime_type,
                        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})

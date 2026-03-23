import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_admin_or_super, require_super_admin
from app.models.user import User
from app.schemas.asset_category import CategoryCreate, CategoryUpdate, CategoryOut
from app.schemas.common import ResponseSchema
from app.services import category_service

router = APIRouter(prefix="/asset-categories", tags=["分类管理"])


@router.get("", response_model=ResponseSchema[list[CategoryOut]])
def list_categories(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super),
):
    items = category_service.list_categories(db, include_inactive)
    return ResponseSchema(data=[CategoryOut.model_validate(c) for c in items])


@router.post("", response_model=ResponseSchema[CategoryOut])
def create_category(
    body: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    cat = category_service.create_category(db, body)
    return ResponseSchema(data=CategoryOut.model_validate(cat), message="分类已创建")


@router.put("/{cat_id}", response_model=ResponseSchema[CategoryOut])
def update_category(
    cat_id: uuid.UUID,
    body: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    cat = category_service.update_category(db, cat_id, body)
    return ResponseSchema(data=CategoryOut.model_validate(cat), message="分类已更新")


@router.delete("/{cat_id}", response_model=ResponseSchema[dict])
def delete_category(
    cat_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    data = category_service.delete_category(db, cat_id, current_user.id)
    return ResponseSchema(data=data, message="分类已删除")

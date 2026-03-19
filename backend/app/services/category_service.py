import uuid

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.asset_category import AssetCategory
from app.schemas.asset_category import CategoryCreate, CategoryUpdate


def list_categories(db: Session, include_inactive: bool = False) -> list[AssetCategory]:
    query = db.query(AssetCategory)
    if not include_inactive:
        query = query.filter(AssetCategory.is_active == True)
    return query.order_by(AssetCategory.name).all()


def create_category(db: Session, data: CategoryCreate) -> AssetCategory:
    if db.query(AssetCategory).filter(AssetCategory.name == data.name).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="分类名已存在")
    cat = AssetCategory(name=data.name, description=data.description)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


def update_category(db: Session, cat_id: uuid.UUID, data: CategoryUpdate) -> AssetCategory:
    cat = db.query(AssetCategory).filter(AssetCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分类不存在")
    if data.name is not None:
        existing = db.query(AssetCategory).filter(AssetCategory.name == data.name, AssetCategory.id != cat_id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="分类名已存在")
        cat.name = data.name
    if data.description is not None:
        cat.description = data.description
    if data.is_active is not None:
        cat.is_active = data.is_active
    db.commit()
    db.refresh(cat)
    return cat


def deactivate_category(db: Session, cat_id: uuid.UUID) -> AssetCategory:
    cat = db.query(AssetCategory).filter(AssetCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分类不存在")
    cat.is_active = False
    db.commit()
    db.refresh(cat)
    return cat

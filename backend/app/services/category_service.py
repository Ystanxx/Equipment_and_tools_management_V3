import uuid

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.asset import Asset
from app.models.asset_category import AssetCategory
from app.schemas.asset_category import CategoryCreate, CategoryUpdate
from app.services import audit_service


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


def delete_category(db: Session, cat_id: uuid.UUID, operator_id: uuid.UUID) -> dict:
    cat = db.query(AssetCategory).filter(AssetCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分类不存在")

    active_asset = (
        db.query(Asset.id, Asset.name)
        .filter(Asset.category_id == cat_id, Asset.is_active == True)
        .order_by(Asset.created_at.desc())
        .first()
    )
    if active_asset:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"分类已被设备“{active_asset.name}”使用，无法删除",
        )

    db.query(Asset).filter(Asset.category_id == cat_id, Asset.is_active == False).update(
        {Asset.category_id: None},
        synchronize_session=False,
    )

    payload = {"id": str(cat.id), "name": cat.name}
    audit_service.log(
        db,
        operator_id,
        "CATEGORY_DELETE",
        "AssetCategory",
        cat.id,
        description=f"删除分类 {cat.name}",
        snapshot=payload,
    )
    db.delete(cat)
    db.commit()
    return payload

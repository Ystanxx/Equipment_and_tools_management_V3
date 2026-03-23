import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.asset import Asset
from app.models.asset_type import AssetTypeOption
from app.schemas.asset_type import AssetTypeCreate, AssetTypeUpdate
from app.services import audit_service


DEFAULT_ASSET_TYPE_NAMES = ["固定资产", "非固定资产"]


def seed_default_asset_types(db: Session) -> None:
    existing_count = db.query(AssetTypeOption.id).count()
    if existing_count > 0:
        return

    for name in DEFAULT_ASSET_TYPE_NAMES:
        db.add(AssetTypeOption(name=name, description=None, is_active=True))
    db.commit()


def list_asset_types(db: Session, include_inactive: bool = False) -> list[AssetTypeOption]:
    query = db.query(AssetTypeOption)
    if not include_inactive:
        query = query.filter(AssetTypeOption.is_active == True)
    return query.order_by(AssetTypeOption.created_at.asc(), AssetTypeOption.name.asc()).all()


def get_asset_type(db: Session, asset_type_id: uuid.UUID) -> AssetTypeOption:
    item = db.query(AssetTypeOption).filter(AssetTypeOption.id == asset_type_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资产性质不存在")
    return item


def get_active_asset_type(db: Session, asset_type_id: uuid.UUID) -> AssetTypeOption:
    item = get_asset_type(db, asset_type_id)
    if not item.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="资产性质已停用，请选择其他性质")
    return item


def create_asset_type(db: Session, data: AssetTypeCreate) -> AssetTypeOption:
    if db.query(AssetTypeOption).filter(AssetTypeOption.name == data.name).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="资产性质名称已存在")
    item = AssetTypeOption(name=data.name, description=data.description)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_asset_type(db: Session, asset_type_id: uuid.UUID, data: AssetTypeUpdate) -> AssetTypeOption:
    item = get_asset_type(db, asset_type_id)
    if data.name is not None:
        existing = db.query(AssetTypeOption).filter(
            AssetTypeOption.name == data.name,
            AssetTypeOption.id != asset_type_id,
        ).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="资产性质名称已存在")
        item.name = data.name
    if data.description is not None:
        item.description = data.description
    if data.is_active is not None:
        item.is_active = data.is_active
    db.commit()
    db.refresh(item)
    return item


def delete_asset_type(db: Session, asset_type_id: uuid.UUID, operator_id: uuid.UUID) -> dict:
    item = get_asset_type(db, asset_type_id)

    active_asset = (
        db.query(Asset.id, Asset.name)
        .filter(Asset.asset_type_id == asset_type_id, Asset.is_active == True)
        .order_by(Asset.created_at.desc())
        .first()
    )
    if active_asset:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"资产性质已被器材“{active_asset.name}”使用，无法删除",
        )

    db.query(Asset).filter(Asset.asset_type_id == asset_type_id, Asset.is_active == False).update(
        {Asset.asset_type_id: None},
        synchronize_session=False,
    )

    payload = {"id": str(item.id), "name": item.name}
    audit_service.log(
        db,
        operator_id,
        "ASSET_TYPE_DELETE",
        "AssetType",
        item.id,
        description=f"删除资产性质 {item.name}",
        snapshot=payload,
    )
    db.delete(item)
    db.commit()
    return payload

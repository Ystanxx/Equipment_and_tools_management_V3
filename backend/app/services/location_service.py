import uuid

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.asset import Asset
from app.models.storage_location import StorageLocation
from app.schemas.storage_location import LocationCreate, LocationUpdate
from app.services import audit_service


def list_locations(db: Session, include_inactive: bool = False) -> list[StorageLocation]:
    query = db.query(StorageLocation)
    if not include_inactive:
        query = query.filter(StorageLocation.is_active == True)
    return query.order_by(StorageLocation.name).all()


def create_location(db: Session, data: LocationCreate) -> StorageLocation:
    if data.code:
        if db.query(StorageLocation).filter(StorageLocation.code == data.code).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="位置编码已存在")
    loc = StorageLocation(
        code=data.code,
        name=data.name,
        building=data.building,
        room=data.room,
        cabinet=data.cabinet,
        shelf=data.shelf,
        remark=data.remark,
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


def update_location(db: Session, loc_id: uuid.UUID, data: LocationUpdate) -> StorageLocation:
    loc = db.query(StorageLocation).filter(StorageLocation.id == loc_id).first()
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="位置不存在")
    if data.code is not None:
        existing = db.query(StorageLocation).filter(StorageLocation.code == data.code, StorageLocation.id != loc_id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="位置编码已存在")
        loc.code = data.code
    for field in ("name", "building", "room", "cabinet", "shelf", "remark", "is_active"):
        val = getattr(data, field, None)
        if val is not None:
            setattr(loc, field, val)
    db.commit()
    db.refresh(loc)
    return loc


def deactivate_location(db: Session, loc_id: uuid.UUID) -> StorageLocation:
    loc = db.query(StorageLocation).filter(StorageLocation.id == loc_id).first()
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="位置不存在")
    loc.is_active = False
    db.commit()
    db.refresh(loc)
    return loc


def delete_location(db: Session, loc_id: uuid.UUID, operator_id: uuid.UUID) -> dict:
    loc = db.query(StorageLocation).filter(StorageLocation.id == loc_id).first()
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="位置不存在")

    active_asset = (
        db.query(Asset.id, Asset.name)
        .filter(Asset.location_id == loc_id, Asset.is_active == True)
        .order_by(Asset.created_at.desc())
        .first()
    )
    if active_asset:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"位置已被设备“{active_asset.name}”使用，无法删除",
        )

    db.query(Asset).filter(Asset.location_id == loc_id, Asset.is_active == False).update(
        {Asset.location_id: None},
        synchronize_session=False,
    )

    payload = {"id": str(loc.id), "name": loc.name}
    audit_service.log(
        db,
        operator_id,
        "LOCATION_DELETE",
        "StorageLocation",
        loc.id,
        description=f"删除位置 {loc.name}",
        snapshot=payload,
    )
    db.delete(loc)
    db.commit()
    return payload

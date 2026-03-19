import uuid

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.storage_location import StorageLocation
from app.schemas.storage_location import LocationCreate, LocationUpdate


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

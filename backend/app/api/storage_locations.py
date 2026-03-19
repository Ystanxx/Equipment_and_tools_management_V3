import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_admin_or_super
from app.models.user import User
from app.schemas.storage_location import LocationCreate, LocationUpdate, LocationOut
from app.schemas.common import ResponseSchema
from app.services import location_service

router = APIRouter(prefix="/storage-locations", tags=["位置管理"])


@router.get("", response_model=ResponseSchema[list[LocationOut]])
def list_locations(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super),
):
    items = location_service.list_locations(db, include_inactive)
    return ResponseSchema(data=[LocationOut.model_validate(loc) for loc in items])


@router.post("", response_model=ResponseSchema[LocationOut])
def create_location(
    body: LocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super),
):
    loc = location_service.create_location(db, body)
    return ResponseSchema(data=LocationOut.model_validate(loc), message="位置已创建")


@router.put("/{loc_id}", response_model=ResponseSchema[LocationOut])
def update_location(
    loc_id: uuid.UUID,
    body: LocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super),
):
    loc = location_service.update_location(db, loc_id, body)
    return ResponseSchema(data=LocationOut.model_validate(loc), message="位置已更新")


@router.delete("/{loc_id}", response_model=ResponseSchema[LocationOut])
def delete_location(
    loc_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super),
):
    loc = location_service.deactivate_location(db, loc_id)
    return ResponseSchema(data=LocationOut.model_validate(loc), message="位置已停用")

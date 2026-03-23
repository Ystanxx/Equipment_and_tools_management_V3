import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_admin_or_super, require_super_admin
from app.models.user import User
from app.schemas.asset_type import AssetTypeCreate, AssetTypeOut, AssetTypeUpdate
from app.schemas.common import ResponseSchema
from app.services import asset_type_service

router = APIRouter(prefix="/asset-types", tags=["属性管理"])


@router.get("", response_model=ResponseSchema[list[AssetTypeOut]])
def list_asset_types(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super),
):
    items = asset_type_service.list_asset_types(db, include_inactive)
    return ResponseSchema(data=[AssetTypeOut.model_validate(item) for item in items])


@router.post("", response_model=ResponseSchema[AssetTypeOut])
def create_asset_type(
    body: AssetTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    item = asset_type_service.create_asset_type(db, body)
    return ResponseSchema(data=AssetTypeOut.model_validate(item), message="资产性质已创建")


@router.put("/{asset_type_id}", response_model=ResponseSchema[AssetTypeOut])
def update_asset_type(
    asset_type_id: uuid.UUID,
    body: AssetTypeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    item = asset_type_service.update_asset_type(db, asset_type_id, body)
    return ResponseSchema(data=AssetTypeOut.model_validate(item), message="资产性质已更新")


@router.delete("/{asset_type_id}", response_model=ResponseSchema[dict])
def delete_asset_type(
    asset_type_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    payload = asset_type_service.delete_asset_type(db, asset_type_id, current_user.id)
    return ResponseSchema(data=payload, message="资产性质已删除")

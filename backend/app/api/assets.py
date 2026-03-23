import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_active_user, require_admin_or_super, require_super_admin
from app.models.user import User
from app.schemas.asset import AssetCreate, AssetUpdate, AssetOut, AdminUpdateRequest
from app.schemas.common import ResponseSchema, PaginatedData
from app.services import asset_service
from app.utils.enums import AssetStatus

router = APIRouter(prefix="/assets", tags=["设备/工具管理"])


def _to_out(asset) -> AssetOut:
    return AssetOut(
        id=asset.id,
        asset_code=asset.asset_code,
        name=asset.name,
        asset_type=asset.asset_type,
        category_id=asset.category_id,
        category_name=asset.category.name if asset.category else None,
        location_id=asset.location_id,
        location_name=asset.location.name if asset.location else None,
        admin_id=asset.admin_id,
        admin_name=asset.admin.full_name if asset.admin else None,
        status=asset.status,
        brand=asset.brand,
        model=asset.model,
        serial_number=asset.serial_number,
        description=asset.description,
        entry_date=asset.entry_date,
        created_by=asset.created_by,
        remark=asset.remark,
        is_active=asset.is_active,
        created_at=asset.created_at,
        updated_at=asset.updated_at,
    )


@router.get("", response_model=ResponseSchema[PaginatedData[AssetOut]])
def list_assets(
    keyword: str | None = None,
    asset_type: str | None = None,
    category_id: uuid.UUID | None = None,
    location_id: uuid.UUID | None = None,
    admin_id: uuid.UUID | None = None,
    status: AssetStatus | None = None,
    in_stock_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_active_user),
):
    items, total = asset_service.list_assets(
        db, keyword, asset_type, category_id, location_id, admin_id, status, in_stock_only, page, page_size
    )
    data = PaginatedData(
        items=[_to_out(a) for a in items],
        total=total,
        page=page,
        page_size=page_size,
    )
    return ResponseSchema(data=data)


@router.get("/{asset_id}", response_model=ResponseSchema[AssetOut])
def get_asset(
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_active_user),
):
    asset = asset_service.get_asset(db, asset_id)
    return ResponseSchema(data=_to_out(asset))


@router.post("", response_model=ResponseSchema[AssetOut])
def create_asset(
    body: AssetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super),
):
    asset = asset_service.create_asset(db, body, current_user)
    return ResponseSchema(data=_to_out(asset), message="设备/工具已创建")


@router.put("/{asset_id}", response_model=ResponseSchema[AssetOut])
def update_asset(
    asset_id: uuid.UUID,
    body: AssetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super),
):
    asset = asset_service.update_asset(db, asset_id, body, current_user)
    return ResponseSchema(data=_to_out(asset), message="设备/工具已更新")


@router.put("/{asset_id}/admin", response_model=ResponseSchema[AssetOut])
def update_admin(
    asset_id: uuid.UUID,
    body: AdminUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    asset = asset_service.update_asset_admin(db, asset_id, body.admin_id, current_user)
    return ResponseSchema(data=_to_out(asset), message="管理员已变更")

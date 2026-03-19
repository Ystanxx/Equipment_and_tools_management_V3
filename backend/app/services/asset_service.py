import uuid

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.asset import Asset
from app.models.user import User
from app.schemas.asset import AssetCreate, AssetUpdate
from app.services.asset_number_service import generate_asset_code
from app.utils.enums import UserRole, AssetStatus


def list_assets(
    db: Session,
    keyword: str | None = None,
    asset_type: str | None = None,
    category_id: uuid.UUID | None = None,
    location_id: uuid.UUID | None = None,
    admin_id: uuid.UUID | None = None,
    asset_status: AssetStatus | None = None,
    in_stock_only: bool = False,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Asset], int]:
    query = db.query(Asset).filter(Asset.is_active == True)
    if keyword:
        like = f"%{keyword}%"
        query = query.filter((Asset.name.ilike(like)) | (Asset.asset_code.ilike(like)))
    if asset_type:
        query = query.filter(Asset.asset_type == asset_type)
    if category_id:
        query = query.filter(Asset.category_id == category_id)
    if location_id:
        query = query.filter(Asset.location_id == location_id)
    if admin_id:
        query = query.filter(Asset.admin_id == admin_id)
    if asset_status:
        query = query.filter(Asset.status == asset_status)
    if in_stock_only:
        query = query.filter(Asset.status == AssetStatus.IN_STOCK)
    query = query.order_by(Asset.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return items, total


def get_asset(db: Session, asset_id: uuid.UUID) -> Asset:
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="设备/工具不存在")
    return asset


def create_asset(db: Session, data: AssetCreate, current_user: User) -> Asset:
    if current_user.role == UserRole.SUPER_ADMIN:
        if not data.admin_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="超管创建设备必须指定管理员")
        admin_id = data.admin_id
    elif current_user.role == UserRole.ASSET_ADMIN:
        admin_id = current_user.id
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="普通用户无法创建设备")

    asset_code = generate_asset_code(db, data.name)

    asset = Asset(
        asset_code=asset_code,
        name=data.name,
        asset_type=data.asset_type,
        category_id=data.category_id,
        location_id=data.location_id,
        admin_id=admin_id,
        brand=data.brand,
        model=data.model,
        serial_number=data.serial_number,
        description=data.description,
        entry_date=data.entry_date,
        created_by=current_user.id,
        remark=data.remark,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


def update_asset(db: Session, asset_id: uuid.UUID, data: AssetUpdate, current_user: User) -> Asset:
    asset = get_asset(db, asset_id)
    if current_user.role == UserRole.ASSET_ADMIN and asset.admin_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能编辑自己负责的设备")

    for field in ("name", "asset_type", "category_id", "location_id", "brand", "model", "serial_number", "description", "entry_date", "remark", "is_active"):
        val = getattr(data, field, None)
        if val is not None:
            setattr(asset, field, val)
    db.commit()
    db.refresh(asset)
    return asset


def update_asset_admin(db: Session, asset_id: uuid.UUID, new_admin_id: uuid.UUID) -> Asset:
    asset = get_asset(db, asset_id)
    admin = db.query(User).filter(User.id == new_admin_id).first()
    if not admin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="指定管理员不存在")
    if admin.role not in (UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="指定用户不是管理员角色")
    asset.admin_id = new_admin_id
    db.commit()
    db.refresh(asset)
    return asset

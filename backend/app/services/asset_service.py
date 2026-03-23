import uuid

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.asset import Asset
from app.models.audit_log import AuditLog
from app.models.borrow_order_item import BorrowOrderItem
from app.models.user import User
from app.schemas.asset import AssetCreate, AssetUpdate
from app.services.asset_number_service import generate_asset_code
from app.utils.enums import UserRole, AssetStatus
from app.services import audit_service


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
    db.flush()
    audit_service.log(
        db,
        current_user.id,
        "ASSET_CREATE",
        "Asset",
        asset.id,
        description=f"创建设备 {asset_code}",
        snapshot={"asset_code": asset_code, "name": data.name},
    )
    db.commit()
    db.refresh(asset)
    return asset


def update_asset(db: Session, asset_id: uuid.UUID, data: AssetUpdate, current_user: User) -> Asset:
    asset = get_asset(db, asset_id)
    if current_user.role == UserRole.ASSET_ADMIN and asset.admin_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能编辑自己负责的设备")

    workflow_statuses = {
        AssetStatus.PENDING_BORROW_APPROVAL,
        AssetStatus.BORROWED,
        AssetStatus.PENDING_RETURN_APPROVAL,
    }
    if data.status is not None:
        if asset.status in workflow_statuses:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="借还流程中的设备状态由系统自动维护")
        if data.status in workflow_statuses:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能手动设置借还流程状态")
        asset.status = data.status

    for field in ("name", "asset_type", "category_id", "location_id", "brand", "model", "serial_number", "description", "entry_date", "remark", "is_active"):
        val = getattr(data, field, None)
        if val is not None:
            setattr(asset, field, val)
    audit_service.log(
        db,
        current_user.id,
        "ASSET_UPDATE",
        "Asset",
        asset.id,
        description=f"更新设备 {asset.asset_code}",
        snapshot={"name": asset.name, "status": asset.status.value if hasattr(asset.status, 'value') else asset.status},
    )
    db.commit()
    db.refresh(asset)
    return asset


def update_asset_admin(db: Session, asset_id: uuid.UUID, new_admin_id: uuid.UUID, operator: User) -> Asset:
    asset = get_asset(db, asset_id)
    admin = db.query(User).filter(User.id == new_admin_id).first()
    if not admin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="指定管理员不存在")
    if admin.role not in (UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="指定用户不是管理员角色")
    asset.admin_id = new_admin_id
    audit_service.log(
        db,
        operator.id,
        "ASSET_ADMIN_UPDATE",
        "Asset",
        asset.id,
        description=f"变更设备管理员为 {admin.username}",
        snapshot={"asset_code": asset.asset_code, "admin_id": str(new_admin_id)},
    )
    db.commit()
    db.refresh(asset)
    return asset


def delete_asset(db: Session, asset_id: uuid.UUID, operator: User) -> Asset:
    asset = get_asset(db, asset_id)
    if not asset.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="设备已删除")
    if asset.status in (
        AssetStatus.PENDING_BORROW_APPROVAL,
        AssetStatus.BORROWED,
        AssetStatus.PENDING_RETURN_APPROVAL,
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="设备当前处于借还流程中，无法删除")

    asset.is_active = False
    audit_service.log(
        db,
        operator.id,
        "ASSET_DELETE",
        "Asset",
        asset.id,
        description=f"删除设备 {asset.asset_code}",
        snapshot={"asset_code": asset.asset_code, "name": asset.name},
    )
    db.commit()
    db.refresh(asset)
    return asset


def list_recent_deleted_assets(db: Session, limit: int = 5) -> list[Asset]:
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.action == "ASSET_DELETE", AuditLog.target_type == "Asset")
        .order_by(AuditLog.created_at.desc())
        .limit(max(limit * 10, 20))
        .all()
    )
    items: list[Asset] = []
    seen_ids: set[uuid.UUID] = set()
    for log in logs:
        if not log.target_id or log.target_id in seen_ids:
            continue
        asset = db.query(Asset).filter(Asset.id == log.target_id, Asset.is_active == False).first()
        if not asset:
            continue
        items.append(asset)
        seen_ids.add(asset.id)
        if len(items) >= limit:
            break
    return items


def restore_asset(db: Session, asset_id: uuid.UUID, operator: User) -> Asset:
    asset = get_asset(db, asset_id)
    if asset.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="设备未处于删除状态")

    recent_ids = {item.id for item in list_recent_deleted_assets(db, limit=5)}
    if asset.id not in recent_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅支持恢复最近删除的 5 个设备")

    has_history = db.query(BorrowOrderItem.id).filter(BorrowOrderItem.asset_id == asset.id).first()
    if has_history and asset.status in (
        AssetStatus.PENDING_BORROW_APPROVAL,
        AssetStatus.BORROWED,
        AssetStatus.PENDING_RETURN_APPROVAL,
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="设备当前状态异常，无法恢复")

    asset.is_active = True
    audit_service.log(
        db,
        operator.id,
        "ASSET_RESTORE",
        "Asset",
        asset.id,
        description=f"恢复设备 {asset.asset_code}",
        snapshot={"asset_code": asset.asset_code, "name": asset.name},
    )
    db.commit()
    db.refresh(asset)
    return asset

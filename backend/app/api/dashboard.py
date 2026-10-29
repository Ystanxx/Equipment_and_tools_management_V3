from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_active_user, get_db
from app.models.asset import Asset
from app.models.audit_log import AuditLog
from app.models.borrow_approval_task import BorrowApprovalTask
from app.models.notification import Notification
from app.models.registration_request import RegistrationRequest
from app.models.return_approval_task import ReturnApprovalTask
from app.models.return_order import ReturnOrder
from app.schemas.common import ResponseSchema
from app.utils.enums import ApprovalTaskStatus, AssetStatus, RegistrationStatus, ReturnOrderStatus, UserRole

router = APIRouter(prefix="/dashboard", tags=["工作台"])


@router.get('/summary')
def summary(managed_seen_at: datetime | None = None, db: Session = Depends(get_db), user=Depends(get_active_user)):
    admin = user.role in (UserRole.ASSET_ADMIN, UserRole.SUPER_ADMIN)
    super_admin = user.role == UserRole.SUPER_ADMIN
    assets = [Asset.is_active.is_(True)]
    if not super_admin:
        assets.append(Asset.admin_id == user.id)
    def count(model, *filters):
        return select(func.count()).select_from(model).where(*filters).scalar_subquery()
    data = db.execute(select(
        count(Asset, *assets).label('total_assets'),
        count(Asset, *assets, Asset.status == AssetStatus.BORROWED).label('borrowed_assets'),
        count(Asset, *assets, Asset.status == AssetStatus.IN_STOCK).label('stock_assets'),
        count(Asset, *assets, Asset.updated_at > managed_seen_at if managed_seen_at else False).label('managed_assets'),
        count(BorrowApprovalTask, admin, BorrowApprovalTask.status == ApprovalTaskStatus.PENDING,
              True if super_admin else BorrowApprovalTask.approver_id == user.id).label('borrow_approvals'),
        count(ReturnApprovalTask, admin, ReturnApprovalTask.status == ApprovalTaskStatus.PENDING,
              True if super_admin else ReturnApprovalTask.approver_id == user.id,
              ReturnApprovalTask.return_order_id.in_(select(ReturnOrder.id).where(ReturnOrder.status.in_(
                  [ReturnOrderStatus.PENDING_APPROVAL, ReturnOrderStatus.PARTIALLY_APPROVED])))).label('return_approvals'),
        count(RegistrationRequest, super_admin, RegistrationRequest.status == RegistrationStatus.PENDING).label('registrations'),
        count(Notification, Notification.recipient_id == user.id, Notification.is_read.is_(False)).label('unread'),
        select(func.max(Asset.updated_at)).where(Asset.is_active.is_(True)).scalar_subquery().label('asset_version'),
        select(func.max(AuditLog.created_at)).scalar_subquery().label('workflow_version'),
    )).mappings().one()
    return ResponseSchema(data=dict(data))

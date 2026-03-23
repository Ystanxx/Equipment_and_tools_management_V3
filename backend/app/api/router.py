from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.registration_requests import router as registration_router
from app.api.users import router as users_router
from app.api.asset_categories import router as categories_router
from app.api.storage_locations import router as locations_router
from app.api.assets import router as assets_router
from app.api.borrow_orders import router as borrow_orders_router
from app.api.borrow_approvals import router as borrow_approvals_router
from app.api.return_orders import router as return_orders_router
from app.api.return_approvals import router as return_approvals_router
from app.api.audit_logs import router as audit_logs_router
from app.api.attachments import router as attachments_router
from app.api.system_configs import router as system_configs_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth_router)
api_router.include_router(registration_router)
api_router.include_router(users_router)
api_router.include_router(categories_router)
api_router.include_router(locations_router)
api_router.include_router(assets_router)
api_router.include_router(borrow_orders_router)
api_router.include_router(borrow_approvals_router)
api_router.include_router(return_orders_router)
api_router.include_router(return_approvals_router)
api_router.include_router(audit_logs_router)
api_router.include_router(attachments_router)
api_router.include_router(system_configs_router)

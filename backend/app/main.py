import os
import logging
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import inspect, or_
from sqlalchemy.exc import IntegrityError

from app.api.router import api_router
from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.core.deps import get_db
from app.core.schema import assert_schema_current
from app.core.security import hash_password
from app.models.asset_type import AssetTypeOption
from app.models.user import User
from app.services.asset_type_service import seed_default_asset_types
from app.services.attachment_service import cleanup_expired_staged_attachments
from app.utils.enums import UserRole, UserStatus

import app.models  # noqa: F401 — ensure all models are imported for Alembic

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"


def _is_test_mode() -> bool:
    return "PYTEST_CURRENT_TEST" in os.environ


def seed_super_admin():
    db = SessionLocal()
    try:
        existing = (
            db.query(User)
            .filter(
                or_(
                    User.username == settings.SUPER_ADMIN_USERNAME,
                    User.email == settings.SUPER_ADMIN_EMAIL,
                )
            )
            .first()
        )
        if not existing:
            admin = User(
                username=settings.SUPER_ADMIN_USERNAME,
                email=settings.SUPER_ADMIN_EMAIL,
                hashed_password=hash_password(settings.SUPER_ADMIN_PASSWORD),
                full_name="超级管理员",
                role=UserRole.SUPER_ADMIN,
                status=UserStatus.ACTIVE,
            )
            db.add(admin)
            db.commit()
    except IntegrityError:
        # 并发启动或已有管理员记录时回滚，并将其视为已存在即可。
        db.rollback()
        existing = (
            db.query(User)
            .filter(
                or_(
                    User.username == settings.SUPER_ADMIN_USERNAME,
                    User.email == settings.SUPER_ADMIN_EMAIL,
                )
            )
            .first()
        )
        if existing:
            return
        raise
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def seed_asset_types():
    inspector = inspect(engine)
    if not inspector.has_table("asset_types"):
        return

    db = SessionLocal()
    try:
        if db.query(AssetTypeOption.id).first():
            return
        seed_default_asset_types(db)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if _is_test_mode():
        yield
        return

    with engine.connect() as connection:
        assert_schema_current(connection)
    seed_super_admin()
    seed_asset_types()

    # 启动照片与临时附件清理任务
    from apscheduler.schedulers.background import BackgroundScheduler
    from app.services.photo_cleanup_service import run_cleanup
    from app.services.email_outbox_service import drain_outbox
    scheduler = BackgroundScheduler()
    scheduler.add_job(drain_outbox, 'interval', seconds=15, id='email_outbox', max_instances=1, coalesce=True)
    scheduler.add_job(run_cleanup, "cron", hour=3, minute=0, id="photo_cleanup")
    scheduler.add_job(
        cleanup_expired_staged_attachments,
        "interval",
        minutes=5,
        id="staged_attachment_cleanup",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()

    yield

    scheduler.shutdown(wait=False)


app = FastAPI(
    title="器材管理系统 V1",
    version="1.8.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(api_router)


@app.get('/health/ready', include_in_schema=False)
def readiness(db=Depends(get_db)):
    try:
        assert_schema_current(db.connection())
    except Exception:
        return JSONResponse({'status': 'not_ready'}, status_code=503)
    return {'status': 'ready'}


@app.middleware('http')
async def request_diagnostics(request: Request, call_next):
    request_id = uuid.uuid4().hex
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logging.getLogger(__name__).exception('Request failed: %s', request_id)
        response = JSONResponse({'detail': '服务暂时不可用，请稍后重试', 'request_id': request_id}, status_code=500)
    elapsed = (time.perf_counter() - started) * 1000
    response.headers['X-Request-ID'] = request_id
    response.headers['Server-Timing'] = f'app;dur={elapsed:.1f}'
    route = request.scope.get('route')
    logging.getLogger(__name__).info('request_id=%s method=%s route=%s status=%s duration_ms=%.1f',
        request_id, request.method, getattr(route, 'path', 'unmatched'), response.status_code, elapsed)
    return response

# Serve uploaded files
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
@app.get("/uploads/{path:path}", include_in_schema=False)
def uploaded_image(path: str, request: Request, db=Depends(get_db)):
    from app.services.attachment_access import serve_image
    return serve_image(path, request, db)

# Serve frontend static files
if FRONTEND_DIR.exists():
    from app.core.frontend import FrontendBundle
    frontend_bundle = FrontendBundle(FRONTEND_DIR)

    @app.get('/static/{asset_key:path}', include_in_schema=False)
    def immutable_asset(asset_key: str):
        return frontend_bundle.asset(asset_key)

    app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
    app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")

    # Serve logo favicon
    logo_path = FRONTEND_DIR / "public" / "logo.svg"
    if logo_path.exists():
        @app.get("/logo.svg", include_in_schema=False)
        async def serve_logo():
            return FileResponse(logo_path, media_type="image/svg+xml")

    @app.middleware("http")
    async def frontend_cache_control_middleware(request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if request.method == "GET" and (
            path == "/" or path.endswith(".html") or path.startswith(("/css/", "/js/"))
        ):
            response.headers["Cache-Control"] = "no-cache"
        return response

    @app.middleware("http")
    async def spa_middleware(request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if (
            response.status_code == 404
            and request.method == "GET"
            and not path.startswith(("/api/", "/uploads/", "/css/", "/js/", "/static/", "/health/"))
        ):
            file_path = FRONTEND_DIR / path.lstrip("/")
            if path != '/index.html' and file_path.exists() and file_path.is_file():
                return FileResponse(file_path)
            return frontend_bundle.index(request)
        return response

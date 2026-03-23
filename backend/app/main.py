import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.api.router import api_router
from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.core.security import hash_password
from app.models.user import User
from app.utils.enums import UserRole, UserStatus

import app.models  # noqa: F401 — ensure all models are imported for Alembic

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"


def _is_test_mode() -> bool:
    return "PYTEST_CURRENT_TEST" in os.environ


def seed_super_admin():
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == settings.SUPER_ADMIN_USERNAME).first()
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
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if _is_test_mode():
        yield
        return

    seed_super_admin()

    # Start photo cleanup scheduler
    from apscheduler.schedulers.background import BackgroundScheduler
    from app.services.photo_cleanup_service import run_cleanup
    scheduler = BackgroundScheduler()
    scheduler.add_job(run_cleanup, "cron", hour=3, minute=0, id="photo_cleanup")
    scheduler.start()

    yield

    scheduler.shutdown(wait=False)


app = FastAPI(
    title="器材管理系统 V1",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

# Serve uploaded files
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Serve frontend static files
if FRONTEND_DIR.exists():
    app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
    app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")

    @app.middleware("http")
    async def frontend_cache_control_middleware(request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if request.method == "GET" and (
            path == "/" or path.endswith(".html") or path.startswith(("/css/", "/js/"))
        ):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

    @app.middleware("http")
    async def spa_middleware(request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if (
            response.status_code == 404
            and request.method == "GET"
            and not path.startswith(("/api/", "/uploads/", "/css/", "/js/"))
        ):
            file_path = FRONTEND_DIR / path.lstrip("/")
            if file_path.exists() and file_path.is_file():
                return FileResponse(file_path)
            return FileResponse(FRONTEND_DIR / "index.html")
        return response

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
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
    seed_super_admin()
    yield


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

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        file_path = FRONTEND_DIR / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIR / "index.html")

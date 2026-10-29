from pydantic_settings import BaseSettings
from pathlib import Path
import os

BACKEND_DIR = Path(__file__).resolve().parents[2]
ROOT_DIR = BACKEND_DIR.parent
ENV_FILE = os.environ.get('EQUIPMENT_ENV_FILE') or (
    ROOT_DIR / '.env' if (ROOT_DIR / '.env').exists() else BACKEND_DIR / '.env')


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/equipment_mgmt"
    SECRET_KEY: str = "change-me-to-a-random-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    SUPER_ADMIN_USERNAME: str = "admin"
    SUPER_ADMIN_PASSWORD: str = "admin"
    SUPER_ADMIN_EMAIL: str = "admin@example.com"

    UPLOAD_DIR: str = "./uploads"

    # SMTP 邮件通知配置
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_SSL: bool = False
    SMTP_FROM_NAME: str = "器材管理系统"
    SMTP_FROM_EMAIL: str = ""

    model_config = {"env_file": ENV_FILE, "extra": "ignore"}


settings = Settings()

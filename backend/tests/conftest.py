import os
import pytest
import psycopg
from psycopg import sql
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.database import Base
from app.core.deps import get_db
from app.main import app


def _build_test_db_url() -> str:
    explicit_url = os.getenv("TEST_DATABASE_URL")
    if explicit_url:
        return explicit_url

    base_url = make_url(settings.DATABASE_URL)
    database_name = base_url.database or "equipment_mgmt"
    if database_name.endswith("_test"):
        return base_url.render_as_string(hide_password=False)
    return base_url.set(database=f"{database_name}_test").render_as_string(hide_password=False)


TEST_DB_URL = _build_test_db_url()


def _ensure_test_database_exists() -> None:
    url = make_url(TEST_DB_URL)
    maintenance_url = url.set(database="postgres")
    psycopg_url = maintenance_url.render_as_string(hide_password=False).replace("postgresql+psycopg://", "postgresql://")

    with psycopg.connect(psycopg_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (url.database,))
            if cur.fetchone() is None:
                cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(url.database)))

engine = create_engine(TEST_DB_URL, echo=False)
TestSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    _ensure_test_database_exists()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def clean_tables():
    yield
    with engine.connect() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(text(f"TRUNCATE TABLE {table.name} CASCADE"))
        conn.commit()


@pytest.fixture
def db():
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def admin_token(client):
    client.post("/api/v1/auth/register", json={
        "username": "admin_test",
        "email": "admin_test@test.com",
        "password": "testpass",
        "full_name": "Test Admin",
    })
    from app.models.user import User
    from app.utils.enums import UserRole, UserStatus
    session = TestSession()
    user = session.query(User).filter(User.username == "admin_test").first()
    user.role = UserRole.SUPER_ADMIN
    user.status = UserStatus.ACTIVE
    session.commit()
    session.close()

    res = client.post("/api/v1/auth/login", json={"username": "admin_test", "password": "testpass"})
    return res.json()["data"]["access_token"]


@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}

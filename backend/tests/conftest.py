import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.core.deps import get_db
from app.main import app

TEST_DB_URL = "postgresql+psycopg://postgres:postgres@localhost:5432/equipment_mgmt_test"

engine = create_engine(TEST_DB_URL, echo=False)
TestSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)


@pytest.fixture(scope="session", autouse=True)
def setup_db():
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

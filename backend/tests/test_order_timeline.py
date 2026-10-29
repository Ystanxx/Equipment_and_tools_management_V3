"""Tests for the order timeline endpoint."""
from tests.conftest import TestSession
from app.models.user import User
from app.utils.enums import UserRole, UserStatus
from app.models.equipment_order import EquipmentOrder
from app.models.borrow_order import BorrowOrder
from app.services import audit_service
import uuid


def _order(db, applicant_id):
    parent = EquipmentOrder(id=uuid.uuid4(), order_no='TIMELINE-FIX', applicant_id=uuid.UUID(applicant_id))
    order = BorrowOrder(id=uuid.uuid4(), order_no='TIMELINE-FIX', equipment_order_id=parent.id,
                        applicant_id=uuid.UUID(applicant_id))
    db.add_all([parent, order])
    db.commit()
    return order


def _make_user(client, username, role=UserRole.USER):
    client.post("/api/v1/auth/register", json={
        "username": username,
        "email": f"{username}@test.com",
        "password": "testpass",
        "full_name": f"Test {username}",
    })
    session = TestSession()
    user = session.query(User).filter(User.username == username).first()
    user.role = role
    user.status = UserStatus.ACTIVE
    session.commit()
    uid = str(user.id)
    session.close()
    res = client.post("/api/v1/auth/login", json={"username": username, "password": "testpass"})
    token = res.json()["data"]["access_token"]
    return uid, token


def test_timeline_requires_auth(client):
    import uuid
    res = client.get(f"/api/v1/audit-logs/order-timeline/{uuid.uuid4()}")
    assert res.status_code == 401


def test_timeline_forbidden_for_non_owner(client, db):
    """A regular user cannot view timeline for an order they don't own."""
    _, token_a = _make_user(client, "tl_user_a")
    uid_b, _ = _make_user(client, "tl_user_b")
    headers_a = {"Authorization": f"Bearer {token_a}"}

    order = _order(db, uid_b)
    res = client.get(f"/api/v1/audit-logs/order-timeline/{order.id}", headers=headers_a)
    assert res.status_code == 403


def test_timeline_admin_can_view_any(client, db):
    """A super administrator can view another applicant's existing order."""
    _, token = _make_user(client, "tl_admin", UserRole.SUPER_ADMIN)
    headers = {"Authorization": f"Bearer {token}"}

    applicant_id, _ = _make_user(client, 'tl_applicant')
    order = _order(db, applicant_id)
    audit_service.log(db, uuid.UUID(applicant_id), 'BORROW_ORDER_CREATE', order_id=order.id,
                      equipment_order_id=order.equipment_order_id)
    db.commit()
    res = client.get(f"/api/v1/audit-logs/order-timeline/{order.id}", headers=headers)
    assert res.status_code == 200
    assert res.json()["data"][0]['action'] == 'BORROW_ORDER_CREATE'
    assert client.get(f"/api/v1/audit-logs/order-timeline/{uuid.uuid4()}", headers=headers).status_code == 404

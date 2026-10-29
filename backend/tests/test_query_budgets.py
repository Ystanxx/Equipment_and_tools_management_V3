import time
import uuid
from contextlib import contextmanager

import pytest
from sqlalchemy import event

from app.models.borrow_approval_task import BorrowApprovalTask
from app.models.borrow_order import BorrowOrder
from app.models.equipment_order import EquipmentOrder
from app.models.user import User
from app.services import equipment_order_service
from app.utils.enums import BorrowOrderStatus, EquipmentOrderStatus, UserRole, UserStatus


@contextmanager
def sql_counter(db):
    statements = []
    def record(conn, cursor, statement, parameters, context, many):
        statements.append(statement)
    event.listen(db.bind, 'before_cursor_execute', record)
    try:
        yield statements
    finally:
        event.remove(db.bind, 'before_cursor_execute', record)


@pytest.mark.parametrize('size', [10, 1000])
def test_order_pagination_query_budget(db, size):
    user = User(username='query_fixture', full_name='Query fixture', email='query@example.test', hashed_password='unused',
                role=UserRole.SUPER_ADMIN, status=UserStatus.ACTIVE)
    db.add(user)
    db.flush()
    for i in range(size):
        parent = EquipmentOrder(id=uuid.uuid4(), order_no=f'Q{i}', applicant_id=user.id, item_count=1)
        db.add(parent)
        db.add(BorrowOrder(equipment_order_id=parent.id, order_no=f'Q{i}', applicant_id=user.id,
                           item_count=1, status=BorrowOrderStatus.DELIVERED))
    db.commit()
    db.expunge_all()
    start = time.perf_counter()
    with sql_counter(db) as statements:
        orders, total = equipment_order_service.list_equipment_orders(db, page_size=20, status_group='IN_PROGRESS')
        statuses = [equipment_order_service.resolve_equipment_order_status(o) for o in orders]
        names = [o.applicant.username for o in orders]
    assert total == size and len(orders) == min(size, 20)
    assert set(statuses) == {'BORROWED'} and len(names) == len(orders)
    assert len(statements) <= 5
    print(f'orders={size} sql={len(statements)} elapsed_ms={(time.perf_counter()-start)*1000:.1f}')


def test_borrow_approval_and_summary_query_budget(client, db, auth_headers):
    user = db.query(User).filter(User.username == 'admin_test').one()
    for i in range(20):
        parent = EquipmentOrder(id=uuid.uuid4(), order_no=f'A{i}', applicant_id=user.id, item_count=0)
        order = BorrowOrder(id=uuid.uuid4(), equipment_order_id=parent.id, order_no=f'A{i}', applicant_id=user.id)
        db.add_all([parent, order])
        db.add(BorrowApprovalTask(order_id=order.id, approver_id=user.id, item_ids=[]))
    db.commit()
    db.expunge_all()
    with sql_counter(db) as statements:
        response = client.get('/api/v1/borrow-approval-tasks', headers=auth_headers)
    assert response.status_code == 200
    assert response.json()['data']['total'] == 20
    assert len(statements) <= 6  # Includes authentication; no per-task statements.
    with sql_counter(db) as statements:
        response = client.get('/api/v1/dashboard/summary', headers=auth_headers)
    assert response.status_code == 200
    assert response.json()['data']['borrow_approvals'] == 20
    assert len(statements) <= 2

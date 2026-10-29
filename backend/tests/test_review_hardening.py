"""Regression tests using synthetic records and real PostgreSQL transactions."""
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi import HTTPException

from app.models.borrow_order import BorrowOrder
from app.models.user import User
from app.services import borrow_approval_service, borrow_service, attachment_service
from app.utils.enums import UserRole
from tests.test_admin_scopes import _login_as_role
from tests.conftest import TestSession
from tests.test_attachments import _build_image_bytes


@pytest.fixture
def pending_order(client, db, auth_headers, asset_type_ids):
    managers = [_login_as_role(client, db, f"review_{n}", UserRole.ASSET_ADMIN) for n in range(2)]
    assets = [client.post('/api/v1/assets', headers=auth_headers, json={
        'name': f'Review fixture {n}', 'admin_id': str(manager.id),
        'asset_type_id': asset_type_ids['固定资产'],
    }).json()['data']['id'] for n, (manager, _) in enumerate(managers)]
    response = client.post('/api/v1/borrow-orders', headers=auth_headers, json={'asset_ids': assets})
    assert response.status_code == 200
    return response.json()['data'], managers


@pytest.mark.parametrize('actions', [('approve', 'approve'), ('approve', 'reject'), ('approve', 'cancel')])
def test_concurrent_borrow_decisions_refresh_state(pending_order, actions, db):
    order, _ = pending_order
    order_id = uuid.UUID(order['id'])
    barrier = Barrier(2)
    def run(index):
        with TestSession() as session:
            snapshot = session.get(BorrowOrder, order_id)
            list(snapshot.approval_tasks)  # Deliberately cache the old state in both sessions.
            user = session.get(User, snapshot.applicant_id)
            barrier.wait(timeout=10)
            try:
                if actions[index] == 'cancel':
                    borrow_service.cancel_borrow_order(session, order_id, user)
                else:
                    method = getattr(borrow_approval_service, actions[index] + '_task')
                    method(session, uuid.UUID(order['approval_tasks'][index]['id']), user)
                return 200
            except HTTPException as exc:
                session.rollback()
                return exc.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(run, range(2)))
    db.expire_all()
    updated = db.get(BorrowOrder, order_id)
    statuses = {t.status.value for t in updated.approval_tasks}
    if actions == ('approve', 'approve'):
        assert outcomes == [200, 200]
        assert updated.status.value == 'READY_FOR_PICKUP'
        assert statuses == {'APPROVED'}
    elif actions == ('approve', 'reject'):
        assert updated.status.value == 'REJECTED'
        assert 'PENDING' not in statuses
    else:
        assert sorted(outcomes) == [200, 400]
        assert updated.status.value in {'CANCELLED', 'PARTIALLY_APPROVED'}
        assert (updated.status.value == 'CANCELLED') == (statuses == {'SKIPPED'})


def test_order_and_attachment_scope_matches_download(client, db, pending_order, auth_headers):
    order, managers = pending_order
    _, stranger_headers = _login_as_role(client, db, 'review_stranger', UserRole.ASSET_ADMIN)
    order_url = f"/api/v1/equipment-orders/{order['equipment_order_id']}"
    assert client.get('/api/v1/equipment-orders', headers=stranger_headers).json()['data']['total'] == 0
    assert client.get(order_url, headers=stranger_headers).status_code == 403
    assert client.get(order_url + '/timeline', headers=stranger_headers).status_code == 403
    assert client.get('/api/v1/equipment-orders', headers=managers[0][1]).json()['data']['total'] == 1
    upload = client.post('/api/v1/attachments', headers=auth_headers,
        files={'file': ('fixture.png', _build_image_bytes(), 'image/png')},
        data={'photo_type': 'BORROW_ORDER', 'related_type': 'BorrowOrder', 'related_id': order['id']})
    assert upload.status_code == 200
    raw_path = upload.json()['data']['file_path']
    listing = '/api/v1/attachments'
    params = {'related_type': 'BorrowOrder', 'related_id': order['id']}
    assert client.get(listing, params=params, headers=stranger_headers).status_code == 403
    assert client.get('/uploads/' + raw_path).status_code == 401
    assert client.get('/uploads/' + raw_path, headers=stranger_headers).status_code == 403
    signed = client.get(listing, params=params, headers=managers[0][1]).json()['data'][0]['file_path']
    assert client.get('/uploads/' + signed).status_code == 200
    assert client.get('/uploads/' + signed.replace('signature=', 'signature=bad')).status_code == 401
    assert client.get('/api/v1/attachments', headers=stranger_headers).status_code == 422
    assert client.get('/uploads/_staging/nonexistent.json').status_code == 404

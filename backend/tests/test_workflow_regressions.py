"""Synthetic workflow fixtures only; no production exports or credentials."""
import json
import uuid
from datetime import datetime, timedelta, timezone
from io import BytesIO

import pytest
from PIL import Image

from app.models.return_order import ReturnOrder
from app.models.attachment import Attachment
from app.services import attachment_service
from app.utils.enums import UserRole
from tests.test_admin_scopes import _login_as_role


@pytest.fixture
def mixed_order(client, db, auth_headers, asset_type_ids):
    managers = [_login_as_role(client, db, f"handoff_{n}", UserRole.ASSET_ADMIN) for n in range(2)]
    assets = []
    for n, (user, _) in enumerate(managers):
        response = client.post('/api/v1/assets', headers=auth_headers, json={
            'name': f'Fixture {n}', 'admin_id': str(user.id),
            'asset_type_id': asset_type_ids['固定资产'],
        })
        assert response.status_code == 200
        assets.append(response.json()['data']['id'])
    response = client.post('/api/v1/borrow-orders', headers=auth_headers,
                           json={'asset_ids': assets, 'purpose': 'Synthetic regression'})
    assert response.status_code == 200
    order = response.json()['data']
    for task in order['approval_tasks']:
        assert client.post(f"/api/v1/borrow-approval-tasks/{task['id']}/approve",
                           headers=auth_headers, json={}).status_code == 200
    return order, managers, assets


def _return_payload(order):
    return {'borrow_order_id': order['id'], 'items': [
        {'asset_id': item['asset_id'], 'borrow_order_item_id': item['id'], 'condition': 'GOOD'}
        for item in order['items']
    ]}


def test_managers_confirm_only_their_items_and_do_not_overwrite_reborrow(client, mixed_order, auth_headers):
    order, managers, assets = mixed_order
    for n, (_, headers) in enumerate(managers):
        result = client.post(f"/api/v1/borrow-orders/{order['id']}/deliver", headers=headers)
        assert result.status_code == 200
        data = result.json()['data']
        assert data['handoff_completed_count'] == n + 1
        assert not data['can_deliver']
        assert data['status'] == ('READY_FOR_PICKUP' if n == 0 else 'DELIVERED')
        if n == 0:
            listing = client.get('/api/v1/borrow-orders?managed=true&status=READY_FOR_PICKUP', headers=headers).json()['data']['items']
            assert len(listing[0]['items']) == 2
            assert not listing[0]['can_deliver']
        unified = client.get(f"/api/v1/equipment-orders/{order['equipment_order_id']}", headers=headers).json()['data']
        assert not unified['borrow_order']['can_deliver']
    ret = client.post('/api/v1/return-orders', headers=auth_headers, json=_return_payload(order)).json()['data']
    for task in ret['approval_tasks']:
        assert client.post(f"/api/v1/return-approval-tasks/{task['id']}/approve", headers=auth_headers, json={}).status_code == 200
    first = client.post(f"/api/v1/return-orders/{ret['id']}/stock-in", headers=managers[0][1]).json()['data']
    assert first['status'] == 'APPROVED' and first['handoff_completed_count'] == 1
    assert not first['can_stock_in']
    # A device already received can enter a new borrowing while another manager is still receiving.
    new = client.post('/api/v1/borrow-orders', headers=auth_headers, json={'asset_ids':[assets[0]]})
    assert new.status_code == 200
    result = client.post(f"/api/v1/return-orders/{ret['id']}/stock-in", headers=managers[1][1])
    assert result.status_code == 200 and result.json()['data']['status'] == 'COMPLETED'
    assert client.get(f'/api/v1/assets/{assets[0]}', headers=auth_headers).json()['data']['status'] == 'PENDING_BORROW_APPROVAL'


def test_rejected_return_expires_siblings_and_old_task_cannot_change_resubmission(client, mixed_order, auth_headers):
    order, _, assets = mixed_order
    client.post(f"/api/v1/borrow-orders/{order['id']}/deliver", headers=auth_headers)
    payload = _return_payload(order)
    ret = client.post('/api/v1/return-orders', headers=auth_headers, json=payload).json()['data']
    first, second = ret['approval_tasks']
    assert client.post(f"/api/v1/return-approval-tasks/{first['id']}/reject", headers=auth_headers, json={'comment':'Retry'}).status_code == 200
    detail = client.get(f"/api/v1/return-orders/{ret['id']}", headers=auth_headers).json()['data']
    assert {t['status'] for t in detail['approval_tasks']} == {'REJECTED','SKIPPED'}
    for asset in assets:
        assert client.get(f'/api/v1/assets/{asset}', headers=auth_headers).json()['data']['status'] == 'BORROWED'
    assert client.post('/api/v1/return-orders', headers=auth_headers, json=payload).status_code == 200
    old_action = client.post(f"/api/v1/return-approval-tasks/{second['id']}/approve", headers=auth_headers, json={})
    assert old_action.status_code == 400
    for asset in assets:
        assert client.get(f'/api/v1/assets/{asset}', headers=auth_headers).json()['data']['status'] == 'PENDING_RETURN_APPROVAL'


def _stage(client, headers):
    data = BytesIO()
    Image.new('RGB', (8, 8), 'white').save(data, 'PNG')
    response = client.post('/api/v1/attachments/stage', headers=headers,
        files={'file':('synthetic.png', data.getvalue(), 'image/png')}, data={'photo_type':'RETURN_ITEM'})
    assert response.status_code == 200
    return response.json()['data']['stage_token']


def test_photos_and_return_are_atomic_and_retry_is_idempotent(client, db, mixed_order, auth_headers, monkeypatch, tmp_path):
    monkeypatch.setattr(attachment_service, 'UPLOAD_DIR', tmp_path)
    monkeypatch.setattr(attachment_service, 'STAGING_DIR', tmp_path / '_staging')
    order, _, assets = mixed_order
    client.post(f"/api/v1/borrow-orders/{order['id']}/deliver", headers=auth_headers)
    tokens = [_stage(client, auth_headers) for _ in range(2)]
    payload = _return_payload(order)
    payload['submission_id'] = str(uuid.uuid4())
    for item, token in zip(payload['items'], tokens):
        item['staged_photo_tokens'] = [token]
    meta_path = attachment_service.STAGING_DIR / (tokens[1] + '.json')
    meta = json.loads(meta_path.read_text(encoding='utf-8'))
    meta['created_at'] = (datetime.now(timezone.utc) - timedelta(minutes=11)).isoformat()
    meta_path.write_text(json.dumps(meta), encoding='utf-8')
    response = client.post('/api/v1/return-orders', headers=auth_headers, json=payload)
    assert response.status_code == 404
    assert db.query(ReturnOrder).count() == 0 and db.query(Attachment).count() == 0
    assert not list(tmp_path.glob('RETURN_ITEM/**/*.*'))
    assert (attachment_service.STAGING_DIR / (tokens[0]+'.json')).exists()
    for asset in assets:
        assert client.get(f'/api/v1/assets/{asset}', headers=auth_headers).json()['data']['status'] == 'BORROWED'
    payload['items'][1]['staged_photo_tokens'] = [_stage(client, auth_headers)]
    response = client.post('/api/v1/return-orders', headers=auth_headers, json=payload)
    assert response.status_code == 200
    ret = response.json()['data']
    # Repeat even after staging files were consumed, as happens when the success response is lost.
    retry = client.post('/api/v1/return-orders', headers=auth_headers, json=payload)
    assert retry.status_code == 200 and retry.json()['data']['id'] == ret['id']
    assert db.query(ReturnOrder).count() == 1 and db.query(Attachment).count() == 2
    assert {str(a.related_id) for a in db.query(Attachment).all()} == {i['id'] for i in ret['items']}


def test_duplicate_return_items_are_rejected(client, mixed_order, auth_headers):
    order, _, _ = mixed_order
    client.post(f"/api/v1/borrow-orders/{order['id']}/deliver", headers=auth_headers)
    payload = _return_payload(order)
    payload['items'] = [payload['items'][0]] * 2
    assert client.post('/api/v1/return-orders', headers=auth_headers, json=payload).status_code == 400

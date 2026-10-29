import re
import uuid

import pytest
from alembic import command
from sqlalchemy import text

from app.core.schema import assert_schema_current, migration_config
from tests.conftest import engine


def test_unexpected_api_error_is_json_with_request_id(client, auth_headers, monkeypatch):
    from app.services import equipment_order_service
    def fail(*args, **kwargs):
        raise RuntimeError('private fixture database details')
    monkeypatch.setattr(equipment_order_service, 'list_equipment_orders', fail)
    response = client.get('/api/v1/equipment-orders', headers=auth_headers)
    assert response.status_code == 500
    assert response.json()['request_id'] == response.headers['x-request-id']
    assert 'private fixture' not in response.text
    assert 'server-timing' in response.headers


def test_hashed_assets_and_html_revalidation(client):
    response = client.get('/')
    assert response.status_code == 200 and response.headers['cache-control'] == 'no-cache'
    path = re.search(r'/static/[a-f0-9]+/js/api.js', response.text).group(0)
    asset = client.get(path)
    assert asset.status_code == 200 and 'immutable' in asset.headers['cache-control']
    assert 'queueUpload' in asset.text
    assert client.get('/', headers={'If-None-Match': response.headers['etag']}).status_code == 304
    assert client.get(path.replace('/static/', '/static/bad')).status_code == 404


def test_upgrade_from_production_revision_backfills_search_and_readiness(client):
    # This test deliberately replaces only the disposable runner's schema.
    if not (engine.url.database or '').startswith('equipment_review_'):
        pytest.skip('Migration replay requires scripts/test_isolated.py')
    with engine.begin() as connection:
        connection.execute(text('DROP SCHEMA public CASCADE'))
        connection.execute(text('CREATE SCHEMA public'))
    command.upgrade(migration_config(), 'd81a4e2c7601')
    with engine.begin() as connection:
        user_id, asset_id = uuid.uuid4(), uuid.uuid4()
        connection.execute(text("INSERT INTO users (id,username,email,hashed_password,full_name,role,status,email_notifications_enabled,created_at,updated_at) VALUES (:id,'migration_fixture','migration@example.test','unused','Fixture','SUPER_ADMIN','ACTIVE',true,now(),now())"), {'id': user_id})
        connection.execute(text("INSERT INTO assets (id,asset_code,name,admin_id,created_by,status,is_active,created_at,updated_at) VALUES (:id,'MIG001','拉曼光谱仪',:user,:user,'IN_STOCK',true,now(),now())"), {'id': asset_id, 'user': user_id})
        with pytest.raises(RuntimeError, match='迁移版本'):
            assert_schema_current(connection)
    assert client.get('/health/ready').status_code == 503
    command.upgrade(migration_config(), 'head')
    with engine.connect() as connection:
        assert_schema_current(connection)
        row = connection.execute(text('SELECT pinyin_full,pinyin_initials FROM assets WHERE id=:id'), {'id': asset_id}).one()
        assert row == ('lamanguangpuyi', 'lmgpy')
        assert connection.execute(text('SELECT count(*) FROM email_outbox')).scalar() == 0
    assert client.get('/health/ready').status_code == 200

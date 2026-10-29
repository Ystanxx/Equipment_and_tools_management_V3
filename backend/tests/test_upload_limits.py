from concurrent.futures import ThreadPoolExecutor
from threading import Event

from app.api import attachments
from app.core.deps import get_db
from app.main import app
from app.services import attachment_service
from tests.conftest import TestSession
from tests.test_attachments import _build_image_bytes


def test_staging_rejects_oversized_file_before_image_processing(client, auth_headers, monkeypatch):
    original = attachments.get_config_value
    monkeypatch.setattr(attachments, 'get_config_value', lambda db, key: 1 if key == 'photo_max_upload_mb' else original(db, key))
    def unexpected(*args):
        raise AssertionError('oversized image must not be decoded')
    monkeypatch.setattr(attachment_service, '_process_image', unexpected)
    result = client.post('/api/v1/attachments/stage', headers=auth_headers,
        files={'file': ('large.png', b'x' * (2 * 1024 * 1024), 'image/png')}, data={'photo_type': 'RETURN_ITEM'})
    assert result.status_code == 400 and '1MB' in result.json()['detail']


def test_image_processing_does_not_block_other_requests(client, auth_headers, monkeypatch):
    entered, release = Event(), Event()
    original = attachment_service._process_image
    def slow_image(db, content):
        entered.set()
        if not release.wait(timeout=8):
            raise AssertionError('event loop did not serve the parallel request')
        return original(db, content)
    monkeypatch.setattr(attachment_service, '_process_image', slow_image)
    # Concurrent HTTP calls must use separate SQLAlchemy sessions.
    previous = app.dependency_overrides[get_db]
    def session():
        with TestSession() as db:
            yield db
    app.dependency_overrides[get_db] = session
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(client.post, '/api/v1/attachments/stage', headers=auth_headers,
                files={'file': ('fixture.png', _build_image_bytes(), 'image/png')}, data={'photo_type': 'RETURN_ITEM'})
            try:
                assert entered.wait(timeout=5)
                response = client.get('/api/v1/dashboard/summary', headers=auth_headers)
                assert response.status_code == 200
                assert not future.done()  # Summary completed while image processing was still waiting.
            finally:
                release.set()
            assert future.result(timeout=5).status_code == 200
    finally:
        app.dependency_overrides[get_db] = previous

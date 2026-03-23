from io import BytesIO
from pathlib import Path

from PIL import Image

from app.services import attachment_service
from app.utils.enums import AssetType


def _create_asset(client, auth_headers, admin_id: str) -> str:
    category = client.post(
        "/api/v1/asset-categories",
        headers=auth_headers,
        json={"name": "附件测试分类"},
    ).json()["data"]["id"]
    location = client.post(
        "/api/v1/storage-locations",
        headers=auth_headers,
        json={"name": "附件测试位置", "code": "ATT001", "building": "A", "room": "101"},
    ).json()["data"]["id"]
    response = client.post(
        "/api/v1/assets",
        headers=auth_headers,
        json={
            "name": "附件测试设备",
            "asset_type": AssetType.DEVICE.value,
            "category_id": category,
            "location_id": location,
            "admin_id": admin_id,
        },
    )
    return response.json()["data"]["id"]


def test_attachment_upload_generates_thumbnail_and_audit_log(client, auth_headers, tmp_path, monkeypatch):
    monkeypatch.setattr(attachment_service, "UPLOAD_DIR", tmp_path)

    me = client.get("/api/v1/auth/me", headers=auth_headers).json()["data"]
    asset_id = _create_asset(client, auth_headers, me["id"])

    image = Image.new("RGB", (2400, 1800), color=(210, 140, 120))
    payload = BytesIO()
    image.save(payload, format="PNG")
    payload.seek(0)

    response = client.post(
        "/api/v1/attachments",
        headers=auth_headers,
        files={"file": ("inventory.png", payload.getvalue(), "image/png")},
        data={
            "photo_type": "INVENTORY",
            "related_type": "Asset",
            "related_id": asset_id,
        },
    )
    assert response.status_code == 200

    attachment = response.json()["data"]
    standard_path = tmp_path / Path(attachment["file_path"])
    thumb_path = tmp_path / Path(attachment["thumb_path"])
    assert standard_path.exists()
    assert thumb_path.exists()

    with Image.open(standard_path) as standard_image:
        assert max(standard_image.size) <= 1600

    with Image.open(thumb_path) as thumb_image:
        assert max(thumb_image.size) <= 360

    audit_logs = client.get("/api/v1/audit-logs", headers=auth_headers).json()["data"]["items"]
    assert any(item["action"] == "ATTACHMENT_UPLOAD" for item in audit_logs)

from io import BytesIO
from pathlib import Path

from PIL import Image


def test_upload_attachment_generates_thumbnail(client, auth_headers):
    admin_id = _get_admin_id(client, auth_headers)
    asset_res = client.post(
        "/api/v1/assets",
        json={"name": "附件测试设备", "asset_type": "DEVICE", "admin_id": admin_id},
        headers=auth_headers,
    )
    assert asset_res.status_code == 200
    asset_id = asset_res.json()["data"]["id"]

    config_res = client.put(
        "/api/v1/system-configs",
        json={"values": {"photo_target_format": "WEBP", "photo_standard_max_edge": 640, "photo_thumb_max_edge": 180}},
        headers=auth_headers,
    )
    assert config_res.status_code == 200

    payload = _build_image_bytes()
    upload_res = client.post(
        "/api/v1/attachments",
        headers=auth_headers,
        files={"file": ("sample.png", payload, "image/png")},
        data={"photo_type": "INVENTORY", "related_type": "Asset", "related_id": asset_id},
    )
    assert upload_res.status_code == 200
    data = upload_res.json()["data"]
    assert data["file_path"].endswith(".webp")
    assert data["thumb_path"].endswith(".webp")
    assert data["mime_type"] == "image/webp"

    standard_file = Path("uploads") / data["file_path"]
    thumb_file = Path("uploads") / data["thumb_path"]
    assert standard_file.exists()
    assert thumb_file.exists()

    with Image.open(standard_file) as standard_img:
        assert max(standard_img.size) <= 640

    with Image.open(thumb_file) as thumb_img:
        assert max(thumb_img.size) <= 180


def _build_image_bytes() -> bytes:
    image = Image.new("RGB", (2400, 1200), color=(220, 140, 90))
    payload = BytesIO()
    image.save(payload, format="PNG")
    return payload.getvalue()


def _get_admin_id(client, headers):
    me = client.get("/api/v1/auth/me", headers=headers)
    return me.json()["data"]["id"]

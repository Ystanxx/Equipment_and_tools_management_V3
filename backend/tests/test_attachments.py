import json
from io import BytesIO
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image

from app.services import attachment_service


def test_upload_attachment_generates_thumbnail(client, auth_headers, asset_type_ids):
    admin_id = _get_admin_id(client, auth_headers)
    asset_res = client.post(
        "/api/v1/assets",
        json={"name": "附件测试设备", "asset_type_id": asset_type_ids["固定资产"], "admin_id": admin_id},
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

    upload_root = Path(__file__).resolve().parents[1] / "uploads"
    standard_file = upload_root / data["file_path"]
    thumb_file = upload_root / data["thumb_path"]
    assert standard_file.exists()
    assert thumb_file.exists()

    with Image.open(standard_file) as standard_img:
        assert max(standard_img.size) <= 640

    with Image.open(thumb_file) as thumb_img:
        assert max(thumb_img.size) <= 180


def test_upload_attachment_with_broken_image_returns_json_400(client, auth_headers, asset_type_ids):
    admin_id = _get_admin_id(client, auth_headers)
    asset_res = client.post(
        "/api/v1/assets",
        json={"name": "损坏图片测试设备", "asset_type_id": asset_type_ids["固定资产"], "admin_id": admin_id},
        headers=auth_headers,
    )
    assert asset_res.status_code == 200
    asset_id = asset_res.json()["data"]["id"]

    upload_res = client.post(
        "/api/v1/attachments",
        headers=auth_headers,
        files={"file": ("broken.jpg", b"not-a-real-image", "image/jpeg")},
        data={"photo_type": "INVENTORY", "related_type": "Asset", "related_id": asset_id},
    )

    assert upload_res.status_code == 400
    assert upload_res.headers["content-type"].startswith("application/json")
    assert upload_res.json()["detail"] == "图片文件损坏、编码异常或格式不受支持"


def test_stage_and_finalize_attachment_flow(client, auth_headers, asset_type_ids):
    admin_id = _get_admin_id(client, auth_headers)
    asset_res = client.post(
        "/api/v1/assets",
        json={"name": "阶段上传测试设备", "asset_type_id": asset_type_ids["固定资产"], "admin_id": admin_id},
        headers=auth_headers,
    )
    assert asset_res.status_code == 200
    asset_id = asset_res.json()["data"]["id"]

    payload = _build_image_bytes()
    stage_res = client.post(
        "/api/v1/attachments/stage",
        headers=auth_headers,
        files={"file": ("sample.png", payload, "image/png")},
        data={"photo_type": "INVENTORY"},
    )
    assert stage_res.status_code == 200
    staged = stage_res.json()["data"]
    assert staged["stage_token"]
    assert "staging/" in staged["file_path"]

    finalize_res = client.post(
        "/api/v1/attachments/finalize",
        headers=auth_headers,
        data={"stage_token": staged["stage_token"], "related_type": "Asset", "related_id": asset_id},
    )
    assert finalize_res.status_code == 200
    data = finalize_res.json()["data"]
    assert "staging/" not in data["file_path"]
    upload_root = Path(__file__).resolve().parents[1] / "uploads"
    assert (upload_root / data["file_path"]).exists()


def test_finalize_expired_staged_attachment_returns_404(client, auth_headers, asset_type_ids):
    admin_id = _get_admin_id(client, auth_headers)
    asset_res = client.post(
        "/api/v1/assets",
        json={"name": "超时临时附件测试设备", "asset_type_id": asset_type_ids["固定资产"], "admin_id": admin_id},
        headers=auth_headers,
    )
    assert asset_res.status_code == 200
    asset_id = asset_res.json()["data"]["id"]

    payload = _build_image_bytes()
    stage_res = client.post(
        "/api/v1/attachments/stage",
        headers=auth_headers,
        files={"file": ("sample.png", payload, "image/png")},
        data={"photo_type": "INVENTORY"},
    )
    assert stage_res.status_code == 200
    stage_token = stage_res.json()["data"]["stage_token"]

    metadata_path = attachment_service.STAGING_DIR / f"{stage_token}.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["created_at"] = (datetime.now(timezone.utc) - timedelta(minutes=11)).isoformat()
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")

    finalize_res = client.post(
        "/api/v1/attachments/finalize",
        headers=auth_headers,
        data={"stage_token": stage_token, "related_type": "Asset", "related_id": asset_id},
    )
    assert finalize_res.status_code == 404
    assert finalize_res.json()["detail"] == "临时附件已过期，请重新上传"


def test_cleanup_expired_staged_attachments_removes_stale_files(client, auth_headers):
    payload = _build_image_bytes()
    stage_res = client.post(
        "/api/v1/attachments/stage",
        headers=auth_headers,
        files={"file": ("sample.png", payload, "image/png")},
        data={"photo_type": "INVENTORY"},
    )
    assert stage_res.status_code == 200
    stage_token = stage_res.json()["data"]["stage_token"]

    metadata_path = attachment_service.STAGING_DIR / f"{stage_token}.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["created_at"] = (datetime.now(timezone.utc) - timedelta(minutes=11)).isoformat()
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")

    cleaned = attachment_service.cleanup_expired_staged_attachments()
    assert cleaned >= 1
    assert not metadata_path.exists()
    assert not list(attachment_service.STAGING_DIR.glob(f"{stage_token}*"))


def _build_image_bytes() -> bytes:
    image = Image.new("RGB", (2400, 1200), color=(220, 140, 90))
    payload = BytesIO()
    image.save(payload, format="PNG")
    return payload.getvalue()


def _get_admin_id(client, headers):
    me = client.get("/api/v1/auth/me", headers=headers)
    return me.json()["data"]["id"]

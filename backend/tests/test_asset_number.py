from app.utils.pinyin_utils import get_pinyin_prefix


def test_chinese_name():
    assert get_pinyin_prefix("数字示波器") == "SZSBQ"


def test_english_name():
    assert get_pinyin_prefix("Oscilloscope") == "OSCILLOSCOPE"


def test_mixed_name():
    prefix = get_pinyin_prefix("示波器 DSO")
    assert prefix == "SBQDSO"


def test_empty_name():
    assert get_pinyin_prefix("") == "X"
    assert get_pinyin_prefix("123") == "X"


def test_generate_sequential_codes(client, auth_headers, asset_type_ids):
    admin_id = _get_admin_id(client, auth_headers)
    codes = []
    for _ in range(3):
        res = client.post("/api/v1/assets", json={
            "name": "可编程电源",
            "asset_type_id": asset_type_ids["固定资产"],
            "admin_id": admin_id,
        }, headers=auth_headers)
        codes.append(res.json()["data"]["asset_code"])

    assert codes[0].endswith("-001")
    assert codes[1].endswith("-002")
    assert codes[2].endswith("-003")
    assert all(c.split("-")[0] == codes[0].split("-")[0] for c in codes)


def _get_admin_id(client, headers):
    me = client.get("/api/v1/auth/me", headers=headers)
    return me.json()["data"]["id"]

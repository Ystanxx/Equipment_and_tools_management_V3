import re
from pypinyin import pinyin, Style


def get_pinyin_prefix(name: str) -> str:
    cleaned = re.sub(r"[0-9\s\-_\.·]", "", name)
    if not cleaned:
        return "X"

    has_chinese = bool(re.search(r"[\u4e00-\u9fff]", cleaned))

    if has_chinese:
        initials = pinyin(cleaned, style=Style.FIRST_LETTER, errors="ignore")
        prefix = "".join([item[0] for item in initials if item[0].isalpha()])
    else:
        prefix = "".join([ch for ch in cleaned if ch.isalpha()])

    prefix = prefix.upper()

    if not prefix:
        return "X"

    return prefix

import re
from pypinyin import pinyin, Style


def get_pinyin_prefix(name: str) -> str:
    cleaned = re.sub(r"[0-9\s\-_\.·]", "", name)
    if not cleaned:
        return "X"

    prefix_parts: list[str] = []
    for char in cleaned:
        if re.match(r"[\u4e00-\u9fff]", char):
            initials = pinyin(char, style=Style.FIRST_LETTER, errors="ignore")
            if initials and initials[0] and initials[0][0].isalpha():
                prefix_parts.append(initials[0][0])
            continue

        if char.isalpha():
            prefix_parts.append(char)

    prefix = "".join(prefix_parts).upper()

    if not prefix:
        return "X"

    return prefix

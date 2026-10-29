# ----- pinyin helpers -----
import re
from pypinyin import pinyin, Style as PinyinStyle

_CJK_RE = re.compile(r"[一-鿿]")


def _to_pinyin_full(name: str) -> str:
    """将中文名称转为全拼小写，保留英文与数字，忽略符号"""
    if not name:
        return ""
    name = str(name)
    parts: list[str] = []
    for ch in name:
        if _CJK_RE.match(ch):
            py = pinyin(ch, style=PinyinStyle.NORMAL, errors="ignore")
            if py and py[0]:
                parts.append(py[0][0])
        elif ch.isalpha():
            parts.append(ch.lower())
        elif ch.isdigit():
            parts.append(ch)
    return "".join(parts)


def _to_pinyin_initials(name: str) -> str:
    """将中文名称转为首字母小写，保留英文字母首字母"""
    if not name:
        return ""
    name = str(name)
    parts: list[str] = []
    for ch in name:
        if _CJK_RE.match(ch):
            py = pinyin(ch, style=PinyinStyle.FIRST_LETTER, errors="ignore")
            if py and py[0]:
                parts.append(py[0][0])
        elif ch.isalpha():
            parts.append(ch.lower())
    return "".join(parts)



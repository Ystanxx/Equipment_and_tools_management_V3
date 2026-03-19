from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.asset_number_seq import AssetNumberSequence
from app.utils.pinyin_utils import get_pinyin_prefix


def generate_asset_code(db: Session, name: str) -> str:
    prefix = get_pinyin_prefix(name)

    stmt = select(AssetNumberSequence).where(AssetNumberSequence.prefix == prefix).with_for_update()
    seq = db.execute(stmt).scalar_one_or_none()

    if seq is None:
        seq = AssetNumberSequence(prefix=prefix, current_seq=0)
        db.add(seq)
        db.flush()

    seq.current_seq += 1
    db.flush()

    return f"{prefix}-{seq.current_seq:03d}"

from sqlalchemy import String, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AssetNumberSequence(Base):
    __tablename__ = "asset_number_sequences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    prefix: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    current_seq: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

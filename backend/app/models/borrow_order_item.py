import uuid
from datetime import datetime, timezone

from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class BorrowOrderItem(Base):
    __tablename__ = "borrow_order_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("borrow_orders.id"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False)
    # 快照字段 — 防止后续设备信息修改污染历史订单
    asset_code_snapshot: Mapped[str] = mapped_column(String(32), nullable=False)
    asset_name_snapshot: Mapped[str] = mapped_column(String(128), nullable=False)
    admin_id_snapshot: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    admin_name_snapshot: Mapped[str] = mapped_column(String(64), nullable=False)
    location_name_snapshot: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    order = relationship("BorrowOrder", back_populates="items")
    asset = relationship("Asset", lazy="joined")

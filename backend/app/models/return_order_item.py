import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base
from app.utils.enums import ReturnItemCondition, DamageType


class ReturnOrderItem(Base):
    __tablename__ = "return_order_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    return_order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("return_orders.id"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False)
    borrow_order_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("borrow_order_items.id"), nullable=False)
    # 快照字段
    asset_code_snapshot: Mapped[str] = mapped_column(String(32), nullable=False)
    asset_name_snapshot: Mapped[str] = mapped_column(String(128), nullable=False)
    admin_id_snapshot: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    admin_name_snapshot: Mapped[str] = mapped_column(String(64), nullable=False)
    # 归还状态
    condition: Mapped[ReturnItemCondition] = mapped_column(
        SAEnum(ReturnItemCondition, name="return_item_condition", create_constraint=True),
        nullable=False,
    )
    damage_type: Mapped[DamageType | None] = mapped_column(
        SAEnum(DamageType, name="damage_type_enum", create_constraint=True),
        nullable=True,
    )
    damage_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    order = relationship("ReturnOrder", back_populates="items")
    asset = relationship("Asset", lazy="joined")

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Integer, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.utils.enums import EquipmentOrderStatus


class EquipmentOrder(Base):
    __tablename__ = "equipment_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_no: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    applicant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    status: Mapped[EquipmentOrderStatus] = mapped_column(
        SAEnum(EquipmentOrderStatus, name="equipment_order_status", create_constraint=True),
        nullable=False,
        default=EquipmentOrderStatus.PENDING_BORROW_APPROVAL,
    )
    purpose: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_return_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    item_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(nullable=True)
    delivered_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    applicant = relationship("User", foreign_keys=[applicant_id], lazy="joined")
    deliverer = relationship("User", foreign_keys=[delivered_by], lazy="joined")
    borrow_order = relationship("BorrowOrder", back_populates="equipment_order", uselist=False)
    return_orders = relationship("ReturnOrder", back_populates="equipment_order", lazy="selectin")

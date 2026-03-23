import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Integer, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base
from app.utils.enums import ReturnOrderStatus


class ReturnOrder(Base):
    __tablename__ = "return_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    equipment_order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("equipment_orders.id"), nullable=False, index=True)
    order_no: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    borrow_order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("borrow_orders.id"), nullable=False, index=True)
    applicant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status: Mapped[ReturnOrderStatus] = mapped_column(
        SAEnum(ReturnOrderStatus, name="return_order_status", create_constraint=True),
        nullable=False,
        default=ReturnOrderStatus.PENDING_APPROVAL,
    )
    item_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    applicant = relationship("User", lazy="joined")
    equipment_order = relationship("EquipmentOrder", back_populates="return_orders", lazy="joined")
    borrow_order = relationship("BorrowOrder", lazy="joined")
    items = relationship("ReturnOrderItem", back_populates="order", lazy="joined")
    approval_tasks = relationship("ReturnApprovalTask", back_populates="order", lazy="selectin")

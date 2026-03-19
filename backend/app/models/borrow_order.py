import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Integer, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base
from app.utils.enums import BorrowOrderStatus


class BorrowOrder(Base):
    __tablename__ = "borrow_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_no: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    applicant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status: Mapped[BorrowOrderStatus] = mapped_column(
        SAEnum(BorrowOrderStatus, name="borrow_order_status", create_constraint=True),
        nullable=False,
        default=BorrowOrderStatus.PENDING_APPROVAL,
    )
    purpose: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_return_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    item_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(nullable=True)
    delivered_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    applicant = relationship("User", foreign_keys=[applicant_id], lazy="joined")
    deliverer = relationship("User", foreign_keys=[delivered_by], lazy="joined")
    items = relationship("BorrowOrderItem", back_populates="order", lazy="joined")
    approval_tasks = relationship("BorrowApprovalTask", back_populates="order", lazy="selectin")

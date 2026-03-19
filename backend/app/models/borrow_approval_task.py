import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, ARRAY

from app.core.database import Base
from app.utils.enums import ApprovalTaskStatus


class BorrowApprovalTask(Base):
    __tablename__ = "borrow_approval_tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("borrow_orders.id"), nullable=False, index=True)
    approver_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    # 该任务关联的明细 IDs
    item_ids: Mapped[list] = mapped_column(ARRAY(UUID(as_uuid=True)), nullable=False, default=list)
    status: Mapped[ApprovalTaskStatus] = mapped_column(
        SAEnum(ApprovalTaskStatus, name="approval_task_status", create_constraint=True),
        nullable=False,
        default=ApprovalTaskStatus.PENDING,
    )
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    order = relationship("BorrowOrder", back_populates="approval_tasks")
    approver = relationship("User", lazy="joined")

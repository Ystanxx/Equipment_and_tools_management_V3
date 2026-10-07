"""Record individual handoffs and idempotent return submissions.

Revision ID: d81a4e2c7601
Revises: 1f2e3d4c5b6a
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d81a4e2c7601"
down_revision = "1f2e3d4c5b6a"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("borrow_order_items", sa.Column("delivered_at", sa.DateTime(), nullable=True))
    op.add_column("borrow_order_items", sa.Column("delivered_by", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("return_order_items", sa.Column("stocked_in_at", sa.DateTime(), nullable=True))
    op.add_column("return_order_items", sa.Column("stocked_in_by", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("return_orders", sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_unique_constraint("uq_return_orders_submission_id", "return_orders", ["submission_id"])
    # Preserve historical completed handoffs; never put old equipment back into circulation.
    op.execute("""UPDATE borrow_order_items i SET delivered_at = COALESCE(o.delivered_at, o.updated_at),
                  delivered_by = o.delivered_by FROM borrow_orders o WHERE i.order_id = o.id
                  AND o.status IN ('DELIVERED', 'PARTIALLY_RETURNED', 'COMPLETED')""")
    op.execute("""UPDATE return_order_items i SET stocked_in_at = o.updated_at
                  FROM return_orders o WHERE i.return_order_id = o.id AND o.status = 'COMPLETED'""")
    # Expire old pending tasks on rejected batches without touching asset states:
    # those assets may already be participating in a newer return or borrowing.
    op.execute("""UPDATE return_approval_tasks t SET status = 'SKIPPED'
                  FROM return_orders o WHERE t.return_order_id = o.id
                  AND o.status = 'REJECTED' AND t.status = 'PENDING'""")


def downgrade():
    op.drop_constraint("uq_return_orders_submission_id", "return_orders", type_="unique")
    op.drop_column("return_orders", "submission_id")
    op.drop_column("return_order_items", "stocked_in_by")
    op.drop_column("return_order_items", "stocked_in_at")
    op.drop_column("borrow_order_items", "delivered_by")
    op.drop_column("borrow_order_items", "delivered_at")

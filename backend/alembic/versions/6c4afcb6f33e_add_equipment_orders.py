"""add_equipment_orders

Revision ID: 6c4afcb6f33e
Revises: 97d7d57b95dd
Create Date: 2026-03-21 05:25:00.000000
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "6c4afcb6f33e"
down_revision: Union[str, None] = "97d7d57b95dd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


equipment_order_status_enum = postgresql.ENUM(
    "PENDING_BORROW_APPROVAL",
    "BORROW_REJECTED",
    "READY_FOR_PICKUP",
    "BORROWED",
    "PENDING_RETURN_APPROVAL",
    "RETURN_REJECTED",
    "PARTIALLY_RETURNED",
    "COMPLETED",
    "CANCELLED",
    name="equipment_order_status",
    create_type=False,
)


def _map_equipment_status(borrow_status: str, latest_return_status: str | None) -> tuple[str, datetime | None]:
    if borrow_status == "CANCELLED":
        return "CANCELLED", None
    if borrow_status == "REJECTED":
        return "BORROW_REJECTED", None
    if borrow_status in ("PENDING_APPROVAL", "PARTIALLY_APPROVED", "APPROVED"):
        return "PENDING_BORROW_APPROVAL", None
    if borrow_status == "READY_FOR_PICKUP":
        return "READY_FOR_PICKUP", None
    if borrow_status == "DELIVERED":
        if latest_return_status in ("PENDING_APPROVAL", "PARTIALLY_APPROVED", "APPROVED"):
            return "PENDING_RETURN_APPROVAL", None
        if latest_return_status == "REJECTED":
            return "RETURN_REJECTED", None
        return "BORROWED", None
    if borrow_status == "PARTIALLY_RETURNED":
        if latest_return_status in ("PENDING_APPROVAL", "PARTIALLY_APPROVED", "APPROVED"):
            return "PENDING_RETURN_APPROVAL", None
        if latest_return_status == "REJECTED":
            return "RETURN_REJECTED", None
        return "PARTIALLY_RETURNED", None
    if borrow_status == "COMPLETED":
        return "COMPLETED", datetime.now(timezone.utc)
    return "PENDING_BORROW_APPROVAL", None


def upgrade() -> None:
    bind = op.get_bind()
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_type
                WHERE typname = 'equipment_order_status'
            ) THEN
                CREATE TYPE equipment_order_status AS ENUM (
                    'PENDING_BORROW_APPROVAL',
                    'BORROW_REJECTED',
                    'READY_FOR_PICKUP',
                    'BORROWED',
                    'PENDING_RETURN_APPROVAL',
                    'RETURN_REJECTED',
                    'PARTIALLY_RETURNED',
                    'COMPLETED',
                    'CANCELLED'
                );
            END IF;
        END
        $$;
        """
    )

    op.create_table(
        "equipment_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("order_no", sa.String(length=32), nullable=False),
        sa.Column("applicant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", equipment_order_status_enum, nullable=False),
        sa.Column("purpose", sa.Text(), nullable=True),
        sa.Column("expected_return_date", sa.String(length=32), nullable=True),
        sa.Column("item_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("delivered_at", sa.DateTime(), nullable=True),
        sa.Column("delivered_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("order_no", name="uq_equipment_orders_order_no"),
    )
    op.create_index("ix_equipment_orders_order_no", "equipment_orders", ["order_no"], unique=False)
    op.create_index("ix_equipment_orders_applicant_id", "equipment_orders", ["applicant_id"], unique=False)

    op.add_column("borrow_orders", sa.Column("equipment_order_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_borrow_orders_equipment_order_id",
        "borrow_orders",
        "equipment_orders",
        ["equipment_order_id"],
        ["id"],
    )
    op.create_index("ix_borrow_orders_equipment_order_id", "borrow_orders", ["equipment_order_id"], unique=True)

    op.add_column("return_orders", sa.Column("equipment_order_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_return_orders_equipment_order_id",
        "return_orders",
        "equipment_orders",
        ["equipment_order_id"],
        ["id"],
    )
    op.create_index("ix_return_orders_equipment_order_id", "return_orders", ["equipment_order_id"], unique=False)

    op.add_column("audit_logs", sa.Column("equipment_order_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_audit_logs_equipment_order_id", "audit_logs", ["equipment_order_id"], unique=False)

    metadata = sa.MetaData()
    borrow_orders = sa.Table("borrow_orders", metadata, autoload_with=bind)
    return_orders = sa.Table("return_orders", metadata, autoload_with=bind)
    equipment_orders = sa.Table("equipment_orders", metadata, autoload_with=bind)
    audit_logs = sa.Table("audit_logs", metadata, autoload_with=bind)

    return_rows = bind.execute(
        sa.select(
            return_orders.c.id,
            return_orders.c.borrow_order_id,
            return_orders.c.status,
            return_orders.c.created_at,
        )
    ).fetchall()

    return_group_map: dict[uuid.UUID, list[dict]] = {}
    for row in return_rows:
        data = dict(row._mapping)
        return_group_map.setdefault(data["borrow_order_id"], []).append(data)

    borrow_rows = bind.execute(sa.select(borrow_orders)).fetchall()
    borrow_to_equipment: dict[uuid.UUID, uuid.UUID] = {}
    return_to_equipment: dict[uuid.UUID, uuid.UUID] = {}

    for row in borrow_rows:
        data = dict(row._mapping)
        related_returns = sorted(
            return_group_map.get(data["id"], []),
            key=lambda item: item["created_at"] or datetime.min,
            reverse=True,
        )
        latest_return_status = related_returns[0]["status"] if related_returns else None
        equipment_status, completed_at = _map_equipment_status(data["status"], latest_return_status)
        equipment_order_id = uuid.uuid4()

        bind.execute(
            equipment_orders.insert().values(
                id=equipment_order_id,
                order_no=data["order_no"],
                applicant_id=data["applicant_id"],
                status=equipment_status,
                purpose=data["purpose"],
                expected_return_date=data["expected_return_date"],
                item_count=data["item_count"],
                remark=data["remark"],
                delivered_at=data["delivered_at"],
                delivered_by=data["delivered_by"],
                completed_at=completed_at,
                created_at=data["created_at"],
                updated_at=data["updated_at"],
            )
        )

        bind.execute(
            borrow_orders.update()
            .where(borrow_orders.c.id == data["id"])
            .values(equipment_order_id=equipment_order_id)
        )
        borrow_to_equipment[data["id"]] = equipment_order_id

        for return_row in related_returns:
            bind.execute(
                return_orders.update()
                .where(return_orders.c.id == return_row["id"])
                .values(equipment_order_id=equipment_order_id)
            )
            return_to_equipment[return_row["id"]] = equipment_order_id

    audit_rows = bind.execute(
        sa.select(
            audit_logs.c.id,
            audit_logs.c.target_type,
            audit_logs.c.target_id,
            audit_logs.c.order_id,
        )
    ).fetchall()

    for row in audit_rows:
        data = dict(row._mapping)
        equipment_order_id = None
        if data["order_id"] in borrow_to_equipment:
            equipment_order_id = borrow_to_equipment[data["order_id"]]
        elif data["order_id"] in return_to_equipment:
            equipment_order_id = return_to_equipment[data["order_id"]]
        elif data["target_type"] == "BorrowOrder" and data["target_id"] in borrow_to_equipment:
            equipment_order_id = borrow_to_equipment[data["target_id"]]
        elif data["target_type"] == "ReturnOrder" and data["target_id"] in return_to_equipment:
            equipment_order_id = return_to_equipment[data["target_id"]]

        if equipment_order_id:
            bind.execute(
                audit_logs.update()
                .where(audit_logs.c.id == data["id"])
                .values(equipment_order_id=equipment_order_id)
            )

    op.alter_column("borrow_orders", "equipment_order_id", nullable=False)
    op.alter_column("return_orders", "equipment_order_id", nullable=False)
    op.alter_column("equipment_orders", "item_count", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_audit_logs_equipment_order_id", table_name="audit_logs")
    op.drop_column("audit_logs", "equipment_order_id")

    op.drop_index("ix_return_orders_equipment_order_id", table_name="return_orders")
    op.drop_constraint("fk_return_orders_equipment_order_id", "return_orders", type_="foreignkey")
    op.drop_column("return_orders", "equipment_order_id")

    op.drop_index("ix_borrow_orders_equipment_order_id", table_name="borrow_orders")
    op.drop_constraint("fk_borrow_orders_equipment_order_id", "borrow_orders", type_="foreignkey")
    op.drop_column("borrow_orders", "equipment_order_id")

    op.drop_index("ix_equipment_orders_applicant_id", table_name="equipment_orders")
    op.drop_index("ix_equipment_orders_order_no", table_name="equipment_orders")
    op.drop_table("equipment_orders")
    op.execute("DROP TYPE IF EXISTS equipment_order_status")

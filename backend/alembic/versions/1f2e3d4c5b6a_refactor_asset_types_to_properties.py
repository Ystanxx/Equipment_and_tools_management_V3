"""refactor_asset_types_to_properties

Revision ID: 1f2e3d4c5b6a
Revises: 6c4afcb6f33e
Create Date: 2026-03-21 16:20:00.000000
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "1f2e3d4c5b6a"
down_revision: Union[str, None] = "6c4afcb6f33e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


FIXED_ASSET_ID = uuid.UUID("6b98d4b6-57d3-4df8-928a-c8dcbcab4f01")
NON_FIXED_ASSET_ID = uuid.UUID("0e53a820-6d39-4263-a7e5-0df8691fd76f")


def upgrade() -> None:
    op.create_table(
        "asset_types",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("name", name="uq_asset_types_name"),
    )

    asset_types = sa.table(
        "asset_types",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("name", sa.String()),
        sa.column("description", sa.Text()),
        sa.column("is_active", sa.Boolean()),
        sa.column("created_at", sa.DateTime()),
    )
    now = datetime.now(timezone.utc)
    op.bulk_insert(
        asset_types,
        [
            {
                "id": FIXED_ASSET_ID,
                "name": "固定资产",
                "description": "长期登记、需持续管理的器材资产",
                "is_active": True,
                "created_at": now,
            },
            {
                "id": NON_FIXED_ASSET_ID,
                "name": "非固定资产",
                "description": "低值易耗或周转使用的器材资产",
                "is_active": True,
                "created_at": now,
            },
        ],
    )

    op.add_column("assets", sa.Column("asset_type_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE assets
            SET asset_type_id = CASE
                WHEN asset_type = 'DEVICE' THEN CAST(:fixed_asset_id AS uuid)
                ELSE CAST(:non_fixed_asset_id AS uuid)
            END
            """
        ).bindparams(
            fixed_asset_id=str(FIXED_ASSET_ID),
            non_fixed_asset_id=str(NON_FIXED_ASSET_ID),
        )
    )
    op.create_foreign_key(
        "fk_assets_asset_type_id",
        "assets",
        "asset_types",
        ["asset_type_id"],
        ["id"],
    )
    op.create_index("ix_assets_asset_type_id", "assets", ["asset_type_id"], unique=False)
    op.drop_column("assets", "asset_type")
    op.execute("DROP TYPE IF EXISTS asset_type")


def downgrade() -> None:
    asset_type_enum = postgresql.ENUM("DEVICE", "TOOL", name="asset_type")
    asset_type_enum.create(op.get_bind(), checkfirst=True)

    op.add_column("assets", sa.Column("asset_type", asset_type_enum, nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE assets AS a
            SET asset_type = CASE
                WHEN t.name = '固定资产' THEN 'DEVICE'::asset_type
                ELSE 'TOOL'::asset_type
            END
            FROM asset_types AS t
            WHERE a.asset_type_id = t.id
            """
        )
    )
    op.execute("UPDATE assets SET asset_type = 'DEVICE'::asset_type WHERE asset_type IS NULL")
    op.alter_column("assets", "asset_type", nullable=False)

    op.drop_index("ix_assets_asset_type_id", table_name="assets")
    op.drop_constraint("fk_assets_asset_type_id", "assets", type_="foreignkey")
    op.drop_column("assets", "asset_type_id")

    op.drop_table("asset_types")

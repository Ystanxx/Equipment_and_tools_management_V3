"""add_user_email_notification_preference

Revision ID: 97d7d57b95dd
Revises: a4378c03b55d
Create Date: 2026-03-21 03:35:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "97d7d57b95dd"
down_revision: Union[str, None] = "a4378c03b55d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "email_notifications_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.alter_column("users", "email_notifications_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "email_notifications_enabled")

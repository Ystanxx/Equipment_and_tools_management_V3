"""Durable notification delivery outside business transactions."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'f37c8b5d0213'
down_revision = 'e29b7a4c9102'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('email_outbox',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('recipient_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('title', sa.String(256), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('next_attempt_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('lease_token', UUID(as_uuid=True), nullable=True),
        sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_error', sa.String(128), nullable=True))
    op.create_index('ix_email_outbox_next_attempt_at', 'email_outbox', ['next_attempt_at'])


def downgrade():
    op.drop_table('email_outbox')

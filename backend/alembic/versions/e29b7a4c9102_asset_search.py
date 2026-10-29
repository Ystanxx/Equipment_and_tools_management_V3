"""Precompute asset pinyin for consistent paginated search."""
from alembic import op
import sqlalchemy as sa
from pypinyin import pinyin, Style
import re

revision = 'e29b7a4c9102'
down_revision = 'd81a4e2c7601'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('assets', sa.Column('pinyin_full', sa.Text(), nullable=False, server_default=''))
    op.add_column('assets', sa.Column('pinyin_initials', sa.Text(), nullable=False, server_default=''))
    connection = op.get_bind()
    last_id = None
    # Bounded batches; keep the migration independent of future application models.
    while True:
        rows = connection.execute(sa.text('SELECT id, name FROM assets ' +
            ('WHERE id > :last_id ' if last_id else '') + 'ORDER BY id LIMIT 500'), {'last_id': last_id}).all()
        if not rows:
            break
        for row in rows:
            full, initials = [], []
            for ch in row.name:
                if re.match(r'[一-鿿]', ch):
                    full.append(pinyin(ch, style=Style.NORMAL)[0][0])
                    initials.append(pinyin(ch, style=Style.FIRST_LETTER)[0][0])
                elif ch.isalpha():
                    full.append(ch.lower())
                    initials.append(ch.lower())
                elif ch.isdigit():
                    full.append(ch)
            connection.execute(sa.text('UPDATE assets SET pinyin_full=:full, pinyin_initials=:initials WHERE id=:id'),
                               {'full': ''.join(full), 'initials': ''.join(initials), 'id': row.id})
        last_id = rows[-1].id


def downgrade():
    op.drop_column('assets', 'pinyin_initials')
    op.drop_column('assets', 'pinyin_full')

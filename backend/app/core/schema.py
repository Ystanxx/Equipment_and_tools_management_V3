from pathlib import Path
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import text


def migration_config():
    backend = Path(__file__).resolve().parents[2]
    config = Config(str(backend / 'alembic.ini'))
    config.set_main_option('script_location', str(backend / 'alembic'))
    return config


def assert_schema_current(connection):
    expected = set(ScriptDirectory.from_config(migration_config()).get_heads())
    actual = set(MigrationContext.configure(connection).get_current_heads())
    if actual != expected:
        raise RuntimeError('数据库迁移版本落后，请先备份并执行 python -m app.manage upgrade')
    # Also catch manually stamped or incomplete schemas before accepting traffic.
    connection.execute(text('SELECT delivered_at FROM borrow_order_items LIMIT 0'))
    connection.execute(text('SELECT stocked_in_at FROM return_order_items LIMIT 0'))
    connection.execute(text('SELECT pinyin_full, pinyin_initials FROM assets LIMIT 0'))
    connection.execute(text('SELECT lease_token FROM email_outbox LIMIT 0'))

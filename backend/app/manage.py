"""Release commands share exactly the same Settings/environment as the web service."""
import argparse
from alembic import command
from app.core.database import engine
from app.core.schema import assert_schema_current, migration_config


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['check', 'upgrade'])
    args = parser.parse_args()
    if args.action == 'upgrade':
        command.upgrade(migration_config(), 'head')
    with engine.connect() as connection:
        assert_schema_current(connection)
    print('数据库结构与代码版本一致')


if __name__ == '__main__':
    main()

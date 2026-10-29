"""Run pytest in a newly created disposable database; never migrate the configured DB."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import psycopg
from psycopg import sql
from sqlalchemy.engine import make_url
from app.core.config import settings


def main():
    base = make_url(settings.DATABASE_URL)
    name = 'equipment_review_' + uuid.uuid4().hex + '_test'
    connect_url = base.set(database='postgres').render_as_string(hide_password=False).replace('postgresql+psycopg:', 'postgresql:')
    with psycopg.connect(connect_url, autocommit=True) as connection:
        connection.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
        try:
            env = os.environ.copy()
            url = base.set(database=name).render_as_string(hide_password=False)
            env.update(TEST_DATABASE_URL=url, DATABASE_URL=url, SMTP_HOST='', SMTP_PASSWORD='')
            with tempfile.TemporaryDirectory(prefix='equipment-review-') as temporary:
                result = subprocess.run([sys.executable, '-m', 'pytest', '-p', 'no:cacheprovider',
                                         '--basetemp', str(Path(temporary) / 'pytest'), *sys.argv[1:]],
                                        cwd=Path(__file__).resolve().parents[1], env=env)
            return result.returncode
        finally:
            connection.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(name)))


if __name__ == '__main__':
    sys.exit(main())

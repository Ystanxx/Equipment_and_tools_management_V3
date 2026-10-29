"""Local visual QA with disposable synthetic data. Press Enter to stop and clean up."""
import os
from pathlib import Path
import subprocess
import sys
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def serve():
    from alembic import command
    from app.core.schema import migration_config
    command.upgrade(migration_config(), 'head')
    from app.core.database import SessionLocal
    from app.core.security import hash_password
    from app.models.user import User
    from app.models.asset import Asset
    from app.services.borrow_service import create_borrow_order
    from app.utils.enums import UserRole, UserStatus
    with SessionLocal() as db:
        user = User(username='preview', email='preview@example.test', full_name='测试管理员',
                    hashed_password=hash_password('preview-only'), role=UserRole.SUPER_ADMIN, status=UserStatus.ACTIVE)
        db.add(user)
        db.commit()
        for index, name in enumerate(['拉曼光谱仪', '可见红外光谱仪', '示波器', '精密电子天平', '光学显微镜', '光谱分析仪']):
            asset = Asset(name=name, asset_code=f'QA{index:03d}', admin_id=user.id, created_by=user.id)
            db.add(asset)
            db.commit()
            if index < 3:
                create_borrow_order(db, applicant=user, asset_ids=[asset.id], purpose='隔离测试借用', expected_return_date='2026-10-01')
    import uvicorn
    uvicorn.run('app.main:app', host='127.0.0.1', port=8765, log_level='warning')


def main():
    if '--serve' in sys.argv:
        serve()
        return
    import psycopg
    from psycopg import sql
    from sqlalchemy.engine import make_url
    from app.core.config import settings
    base = make_url(settings.DATABASE_URL)
    name = 'equipment_preview_' + uuid.uuid4().hex + '_test'
    url = base.set(database='postgres').render_as_string(hide_password=False).replace('postgresql+psycopg:', 'postgresql:')
    with psycopg.connect(url, autocommit=True) as connection:
        connection.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
        process = None
        try:
            env = os.environ.copy()
            env.update(DATABASE_URL=base.set(database=name).render_as_string(hide_password=False), SMTP_HOST='',
                       SUPER_ADMIN_USERNAME='preview', SUPER_ADMIN_EMAIL='preview@example.test')
            process = subprocess.Popen([sys.executable, __file__, '--serve'], env=env)
            print('Preview http://127.0.0.1:8765 — synthetic login preview / preview-only', flush=True)
            input('Press Enter to stop: ')
        finally:
            if process:
                process.terminate()
                process.wait(timeout=15)
            connection.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(name)))


if __name__ == '__main__':
    main()

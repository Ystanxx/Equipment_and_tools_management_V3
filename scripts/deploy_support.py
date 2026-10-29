"""Small, independently testable helpers for the existing systemd/rsync deployment."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys


class ReleaseError(ValueError):
    """An actionable message that never includes configuration values."""


UPLOAD_PROXY = '''location ^~ /uploads/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache off;
        expires off;
    }'''


def statements(body):
    return ' '.join(re.sub(r'#[^\n]*', '', body).split())


def plan_nginx(content):
    """Only replace the exact legacy block observed on this server, or our own block."""
    matches = list(re.finditer(r'location\s+(?:\^~\s+)?/uploads/\s*\{([^{}]*)\}', content))
    if len(matches) != 1:
        raise ReleaseError('无法唯一识别 /uploads/ 配置，请先人工核对；未修改 Nginx。')
    match = matches[0]
    legacy = 'alias /data/equipment-app/uploads/; expires 7d; add_header Cache-Control "public, max-age=604800";'
    if statements(match.group(0)) == statements(UPLOAD_PROXY):
        return content
    if statements(match.group(1)) != legacy:
        raise ReleaseError('/uploads/ 配置与已核对版本不同，请先人工核对；未修改 Nginx。')
    return content[:match.start()] + UPLOAD_PROXY + content[match.end():]


def backup_db(destination):
    from sqlalchemy.engine import make_url
    # EnvironmentFile is loaded by systemd-run, exactly as for the application.
    raw_url = os.environ.get('DATABASE_URL')
    if not raw_url:
        raise ReleaseError('服务环境文件中缺少 DATABASE_URL，拒绝使用默认数据库。')
    try:
        url = make_url(raw_url)
    except Exception:
        raise ReleaseError('DATABASE_URL 解析失败，请核对服务环境文件。') from None
    if url.get_backend_name() != 'postgresql' or not url.database:
        raise ReleaseError('需要明确的 PostgreSQL 数据库配置。')
    env = os.environ.copy()
    env.update(PGHOST=url.host or 'localhost', PGPORT=str(url.port or 5432),
               PGUSER=url.username or '', PGPASSWORD=url.password or '', PGDATABASE=url.database)
    option_env = {'sslmode': 'PGSSLMODE', 'sslrootcert': 'PGSSLROOTCERT',
                  'sslcert': 'PGSSLCERT', 'sslkey': 'PGSSLKEY', 'options': 'PGOPTIONS',
                  'connect_timeout': 'PGCONNECT_TIMEOUT', 'application_name': 'PGAPPNAME'}
    for key, value in url.query.items():
        if key not in option_env or not isinstance(value, str):
            raise ReleaseError('数据库 URL 包含未支持的备份连接选项，停止发布。')
        env[option_env[key]] = value
    env.setdefault('PGCONNECT_TIMEOUT', '10')
    # Exclusive creation plus the private release directory prevents accidental overwrite.
    with destination.open('xb'):
        pass
    destination.chmod(0o600)
    subprocess.run(['pg_dump', '-Fc', '-f', str(destination)], env=env, check=True)
    subprocess.run(['pg_restore', '--list', str(destination)], stdout=subprocess.DEVNULL, check=True)
    if destination.stat().st_size == 0:
        raise ReleaseError('数据库备份为空，停止发布。')


def check_ready(stream):
    if json.load(stream) != {'status': 'ready'}:
        raise ReleaseError('readiness 未返回预期的 ready 状态。')


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='action', required=True)
    nginx = sub.add_parser('nginx-plan')
    nginx.add_argument('source', type=Path)
    nginx.add_argument('destination', type=Path)
    backup = sub.add_parser('backup-db')
    backup.add_argument('destination', type=Path)
    sub.add_parser('ready')
    args = parser.parse_args()
    if args.action == 'nginx-plan':
        args.destination.write_text(plan_nginx(args.source.read_text()), encoding='utf-8')
    elif args.action == 'backup-db':
        backup_db(args.destination)
    else:
        check_ready(sys.stdin)


if __name__ == '__main__':
    try:
        main()
    except ReleaseError as error:
        print(f'发布检查失败：{error}', file=sys.stderr)
        sys.exit(1)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        # Avoid dumping configuration values, connection URLs, or traceback locals.
        print(f'发布检查失败：{type(error).__name__}', file=sys.stderr)
        sys.exit(1)

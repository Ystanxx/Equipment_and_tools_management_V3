"""Deployment control-flow tests: all service/network/database commands are fakes."""
import importlib.util
import io
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('deploy_support', ROOT / 'scripts/deploy_support.py')
support = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(support)
BASH = os.environ.get('TEST_BASH') or (
    r'C:\Program Files\Git\bin\bash.exe' if os.name == 'nt' else shutil.which('bash'))
LEGACY = '''server {
    server_name lily-lab.cn www.lily-lab.cn;
    location /uploads/ {
        alias /data/equipment-app/uploads/;
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }
    location / { proxy_pass http://127.0.0.1:8000; }
    ssl_certificate /etc/letsencrypt/live/lily-lab.cn/fullchain.pem;
}
'''


class HelperTests(unittest.TestCase):
    def test_proxy_patch_preserves_certificates_and_is_idempotent(self):
        result = support.plan_nginx(LEGACY)
        self.assertIn('location ^~ /uploads/', result)
        self.assertNotIn('alias ', result)
        self.assertNotIn('max-age=604800', result)
        self.assertEqual(result[result.index('    location / {'):], LEGACY[LEGACY.index('    location / {'):])
        self.assertEqual(support.plan_nginx(result), result)

    def test_unrecognized_or_multiple_upload_rules_are_rejected(self):
        for content in (LEGACY.replace('expires 7d;', 'deny all;'), LEGACY + LEGACY,
                        LEGACY.replace('/uploads/', '/other/')):
            with self.subTest(content=content), self.assertRaises(ValueError):
                support.plan_nginx(content)

    def test_readiness_rejects_200_html_and_not_ready_json(self):
        for content in ('<html>login</html>', '{"status":"not_ready"}', '{}'):
            with self.subTest(content=content), self.assertRaises(ValueError):
                support.check_ready(io.StringIO(content))
        support.check_ready(io.StringIO('{"status": "ready"}'))

    def test_backup_never_exposes_password_in_process_arguments(self):
        calls = []
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'database.dump'
            def run(args, **kwargs):
                calls.append((args, kwargs))
                if args[0] == 'pg_dump':
                    output.write_bytes(b'synthetic archive')
            with patch.dict(os.environ, {'DATABASE_URL': 'postgresql+psycopg://fixture:private@localhost/demo?sslmode=require'}), \
                    patch.object(support.subprocess, 'run', side_effect=run):
                support.backup_db(output)
        self.assertEqual(calls[0][1]['env']['PGPASSWORD'], 'private')
        self.assertEqual(calls[0][1]['env']['PGSSLMODE'], 'require')
        self.assertNotIn('private', str([args for args, _ in calls]))
        self.assertEqual(calls[1][0][0:2], ['pg_restore', '--list'])

    def test_backup_failure_is_not_swallowed(self):
        with tempfile.TemporaryDirectory() as directory, \
                patch.dict(os.environ, {'DATABASE_URL': 'postgresql://fixture:private@localhost/demo'}), \
                patch.object(support.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'pg_dump')):
            with self.assertRaises(subprocess.CalledProcessError):
                support.backup_db(Path(directory) / 'database.dump')


# POSIX shell fakes prevent these tests from touching systemd, PostgreSQL, GitHub,
# production directories, or Nginx. Filesystem work is confined to TemporaryDirectory.
FAKE = r'''#!/usr/bin/env bash
set -eu
name="$(basename "$0")"
printf '%s %s\n' "$name" "$*" >> "$EVENTS"
case "$name" in
  id) echo 0 ;;
  flock) [[ "${SCENARIO:-}" != locked ]] ;;
  git)
    while [[ "$1" == -c || "$1" == -C ]]; do shift 2; done
    case "$1" in
      status) [[ "${SCENARIO:-}" != dirty ]] || echo ' M tracked.py' ;;
      fetch) [[ "${SCENARIO:-}" != fetch ]] ;;
      rev-parse)
        if [[ "$*" == *--show-toplevel* ]]; then realpath "$EQUIPMENT_SRC_DIR"; else echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; fi ;;
    esac ;;
  rsync)
    # Assert the production sync excludes both data and in-app backup paths.
    if [[ "$*" == *--delete* ]]; then
      [[ "$*" == *'--exclude backups'* && "$*" == *'--exclude backend/uploads'* ]]
      if [[ "$1" == -av && "${SCENARIO:-}" == sync ]]; then exit 1; fi
    fi ;;
  systemd-run)
    [[ "$*" == *"EnvironmentFile=$(realpath "$EQUIPMENT_APP_DIR")/.env"* ]]
    while [[ "$1" != -- ]]; do shift; done
    shift
    "$@" ;;
  python)
    if [[ "$1" == *deploy_support.py ]]; then
      case "$2" in
        nginx-plan)
          [[ "${SCENARIO:-}" != nginx-plan ]] || exit 1
          cp "$3" "$4" ;;
        backup-db)
          [[ "${SCENARIO:-}" != backup ]] || exit 1
          echo fixture > "$3" ;;
        ready) [[ "$(cat)" == '{"status":"ready"}' ]] ;;
      esac
    elif [[ "$*" == '-m pip install '* ]]; then
      [[ "${SCENARIO:-}" != pip ]]
    elif [[ "$*" == '-m app.manage upgrade' ]]; then
      [[ "${SCENARIO:-}" != migration ]]
    elif [[ "$*" == '-m app.manage check' ]]; then
      [[ "${SCENARIO:-}" != schema ]]
    fi ;;
  curl)
    if [[ "${SCENARIO:-}" == health || ( "${SCENARIO:-}" == public-health && "$*" == *https://* ) ]]; then
      echo '{"status":"not_ready"}'
    else echo '{"status":"ready"}'; fi ;;
  nginx)
    if [[ "${SCENARIO:-}" == nginx-test && -f "$NGINX_SEEN" ]]; then exit 1; fi
    touch "$NGINX_SEEN" ;;
esac
'''


@unittest.skipUnless(BASH and Path(BASH).exists(), 'Bash required for deployment control-flow tests')
class ScriptTests(unittest.TestCase):
    def execute(self, scenario=''):
        with tempfile.TemporaryDirectory(prefix='equipment-deploy-test-') as temporary:
            base = Path(temporary)
            src, app, fakebin = base / 'src', base / 'app', base / 'bin'
            for directory in (src, app / 'backend/uploads', app / '.venv/bin', fakebin):
                directory.mkdir(parents=True, exist_ok=True)
            (app / '.env').write_text('DATABASE_URL=not-a-real-connection\n')
            nginx = base / 'nginx.conf'
            nginx.write_text(LEGACY)
            for name in ('id', 'flock', 'git', 'rsync', 'systemctl', 'systemd-run', 'curl',
                         'nginx', 'pg_dump', 'pg_restore', 'sleep'):
                path = fakebin / name
                path.write_text(FAKE, newline='\n')
                path.chmod(0o755)
            python = app / '.venv/bin/python'
            python.write_text(FAKE, newline='\n')
            python.chmod(0o755)
            events = base / 'events'
            env = dict(os.environ, PATH=str(fakebin) + os.pathsep + os.environ['PATH'],
                       EQUIPMENT_SRC_DIR=src.as_posix(), EQUIPMENT_APP_DIR=app.as_posix(),
                       EQUIPMENT_BACKUP_ROOT=(base / 'backups').as_posix(),
                       EQUIPMENT_NGINX_CONFIG=nginx.as_posix(), EQUIPMENT_UPDATE_LOCK=(base / 'lock').as_posix(),
                       EVENTS=events.as_posix(), NGINX_SEEN=(base / 'nginx-seen').as_posix(), SCENARIO=scenario,
                       MOCK_BIN=fakebin.as_posix(),
                       MSYS_NO_PATHCONV='1')
            launch = 'if command -v cygpath >/dev/null; then MOCK_BIN="$(cygpath -u "$MOCK_BIN")"; fi; export PATH="$MOCK_BIN:$PATH"; exec bash "$1" "$2"'
            result = subprocess.run([BASH, '-c', launch, 'deployment-test',
                                     str(ROOT / 'scripts/update-equipment-app.sh'), 'codex/review-hardening'],
                                    env=env, capture_output=True, text=True, encoding='utf-8', timeout=30)
            event_log = events.read_text() if events.exists() else ''
            complete = list((base / 'backups').glob('*/DEPLOY_COMPLETE'))
            return result, event_log, bool(complete)

    def test_success_backs_up_then_migrates_then_starts(self):
        result, events, complete = self.execute()
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertTrue(complete)
        self.assertLess(events.index('backup-db'), events.index('git -c', events.index('backup-db')))
        self.assertLess(events.index('app.manage upgrade'), events.index('systemctl start equipment-app'))
        self.assertLess(events.index('app.manage check'), events.index('systemctl start equipment-app'))
        self.assertIn('refs/heads/codex/review-hardening:refs/remotes/origin/codex/review-hardening', events)
        self.assertNotIn('reset --hard', events)

    def test_preflight_failures_do_not_stop_the_live_service(self):
        for scenario in ('dirty', 'fetch', 'nginx-plan', 'locked'):
            with self.subTest(scenario=scenario):
                result, events, complete = self.execute(scenario)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('id -u', events)
                self.assertNotIn('systemctl stop', events)
                self.assertFalse(complete)

    def test_failed_backup_restores_only_untouched_old_service(self):
        result, events, complete = self.execute('backup')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('systemctl start equipment-app', events)
        self.assertNotIn('app.manage upgrade', events)
        self.assertNotIn('--delete', events)
        self.assertFalse(complete)

    def test_failures_after_sync_never_start_unmigrated_code(self):
        for scenario in ('sync', 'pip', 'migration', 'schema', 'nginx-test'):
            with self.subTest(scenario=scenario):
                result, events, complete = self.execute(scenario)
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertIn('--delete', events)
                self.assertNotIn('systemctl start equipment-app', events)
                self.assertFalse(complete)

    def test_failed_local_or_public_health_stops_new_service(self):
        for scenario in ('health', 'public-health'):
            with self.subTest(scenario=scenario):
                result, events, complete = self.execute(scenario)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('systemctl start equipment-app', events)
                self.assertTrue(events.rstrip().endswith('systemctl stop equipment-app'))
                self.assertFalse(complete)


if __name__ == '__main__':
    unittest.main()

#!/usr/bin/env bash
# Usage: bash scripts/update-equipment-app.sh [branch]
set -Eeuo pipefail
umask 077

BRANCH="${1:-main}"
APP_SERVICE="${EQUIPMENT_SERVICE:-equipment-app}"
SRC_DIR="${EQUIPMENT_SRC_DIR:-/opt/equipment-app-src}"
APP_DIR="${EQUIPMENT_APP_DIR:-/opt/equipment-app}"
BACKUP_ROOT="${EQUIPMENT_BACKUP_ROOT:-/opt/equipment-app-backups}"
NGINX_CONFIG="${EQUIPMENT_NGINX_CONFIG:-/etc/nginx/sites-enabled/equipment-app}"
PUBLIC_URL="${EQUIPMENT_PUBLIC_URL:-https://www.lily-lab.cn}"
LOCK_FILE="${EQUIPMENT_UPDATE_LOCK:-/run/lock/equipment-app-update.lock}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HELPER="$SCRIPT_DIR/deploy_support.py"
PHASE=preflight
WAS_ACTIVE=0
STOP_REQUESTED=0
CODE_CHANGED=0
BACKUP_DIR=""

fail() { echo "错误：$*" >&2; exit 1; }
git_src() { git -c "safe.directory=$SRC_DIR" -C "$SRC_DIR" "$@"; }

on_exit() {
  local result=$?
  trap - EXIT
  if (( result != 0 )); then
    echo "更新失败，阶段：$PHASE。没有报告更新成功。" >&2
    if (( CODE_CHANGED )); then
      systemctl stop "$APP_SERVICE" || true
      echo "代码或数据库已进入更新阶段，服务保持停止，请先排查；不会自动启动不匹配的版本。" >&2
    elif (( STOP_REQUESTED && WAS_ACTIVE )); then
      echo "尚未同步代码或执行迁移，尝试恢复原服务。" >&2
      systemctl start "$APP_SERVICE" || true
    fi
    [[ -z "$BACKUP_DIR" ]] || echo "本次备份/诊断目录：$BACKUP_DIR" >&2
    echo "查看日志：journalctl -u $APP_SERVICE -n 100 --no-pager" >&2
  fi
  exit "$result"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

[[ $# -le 1 ]] || fail "用法：$0 [branch]"
[[ $(id -u) == 0 ]] || fail "请使用 root 或 sudo 执行更新。"
for executable in git rsync systemctl systemd-run nginx curl flock pg_dump pg_restore realpath; do
  command -v "$executable" >/dev/null || fail "缺少命令：$executable"
done
[[ -f "$HELPER" ]] || fail "缺少同目录 deploy_support.py，请从仓库完整取得 scripts 目录。"
exec 9>"$LOCK_FILE"
flock -n 9 || fail "已有更新正在进行。"
SRC_DIR="$(realpath -e -- "$SRC_DIR")"
APP_DIR="$(realpath -e -- "$APP_DIR")"
BACKUP_ROOT="$(realpath -m -- "$BACKUP_ROOT")"
NGINX_CONFIG="$(realpath -e -- "$NGINX_CONFIG")"
[[ "$SRC_DIR" != / && "$APP_DIR" != / && "$SRC_DIR" != "$APP_DIR" ]] || fail "源码/运行目录不合法。"
[[ "$SRC_DIR/" != "$APP_DIR/"* && "$APP_DIR/" != "$SRC_DIR/"* ]] || fail "源码和运行目录不能互相嵌套。"
[[ "$BACKUP_ROOT/" != "$SRC_DIR/"* && "$BACKUP_ROOT/" != "$APP_DIR/"* ]] || fail "备份目录必须在同步目录之外。"
[[ "$SCRIPT_DIR/" != "$SRC_DIR/"* && "$SCRIPT_DIR/" != "$APP_DIR/"* ]] || fail "请先将脚本和 deploy_support.py 安装到 /root，避免执行中被同步替换。"
BACKEND_DIR="$APP_DIR/backend"
PYTHON="$APP_DIR/.venv/bin/python"
ENV_FILE="$APP_DIR/.env"
[[ -x "$PYTHON" && -f "$ENV_FILE" ]] || fail "缺少生产虚拟环境或 .env。"
[[ -d "$BACKEND_DIR/uploads" ]] || fail "上传目录缺失或软链接失效，停止更新。"
git_src check-ref-format "refs/heads/$BRANCH"
[[ -z "$(git_src status --porcelain)" ]] || fail "源码仓库有本地修改，请先保存；不会 reset --hard。"
[[ "$(realpath -e -- "$(git_src rev-parse --show-toplevel)")" == "$SRC_DIR" ]] || fail "源码路径不是仓库根目录。"

echo "========== 1. 获取发布分支：$BRANCH =========="
git_src fetch --no-tags origin "refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
TARGET_COMMIT="$(git_src rev-parse --verify "refs/remotes/origin/$BRANCH^{commit}")"
SOURCE_BEFORE="$(git_src rev-parse HEAD)"
git_src show "$TARGET_COMMIT:backend/app/manage.py" >/dev/null
echo "目标提交：$TARGET_COMMIT"
nginx -t
mkdir -p -- "$BACKUP_ROOT"
BACKUP_DIR="$(mktemp -d "$BACKUP_ROOT/$(date +%Y%m%d-%H%M%S).XXXXXX")"
cp -a -- "$NGINX_CONFIG" "$BACKUP_DIR/nginx.conf.before"
"$PYTHON" "$HELPER" nginx-plan "$NGINX_CONFIG" "$BACKUP_DIR/nginx.conf.next"
printf 'branch=%s\ntarget_commit=%s\nsource_before=%s\nnginx_config=%s\n' \
  "$BRANCH" "$TARGET_COMMIT" "$SOURCE_BEFORE" "$NGINX_CONFIG" > "$BACKUP_DIR/release.txt"

# systemd parses the same EnvironmentFile as the existing service; no shell sourcing,
# password on the command line, or reliance on the caller's current directory.
run_with_service_env() {
  systemd-run --quiet --wait --pipe --collect \
    --property="WorkingDirectory=$BACKEND_DIR" \
    --property="EnvironmentFile=$ENV_FILE" \
    --setenv="EQUIPMENT_ENV_FILE=$ENV_FILE" -- "$PYTHON" "$@"
}

echo "========== 2. 停服，备份数据库、代码和实际上传文件 =========="
if systemctl is-active --quiet "$APP_SERVICE"; then WAS_ACTIVE=1; fi
PHASE=backup
STOP_REQUESTED=1
systemctl stop "$APP_SERVICE"
# A plain copy of backend/uploads would only copy its symlink. The trailing slash
# below also backs up the actual files under /data/equipment-app/uploads.
mkdir -- "$BACKUP_DIR/app" "$BACKUP_DIR/uploads"
rsync -a --exclude '/backups/' -- "$APP_DIR/" "$BACKUP_DIR/app/"
rsync -a -- "$BACKEND_DIR/uploads/" "$BACKUP_DIR/uploads/"
run_with_service_env "$HELPER" backup-db "$BACKUP_DIR/database.dump"
touch "$BACKUP_DIR/BACKUP_COMPLETE"
echo "备份完成：$BACKUP_DIR"

echo "========== 3. 切换源码提交并同步，保护生产数据 =========="
PHASE=sync
# Detached checkout keeps the server's local main branch intact and records the
# exact release; dirty source checkouts were rejected before stopping the service.
(umask 022; git_src switch --detach "$TARGET_COMMIT")
RSYNC_EXCLUDES=(
  --exclude '.git' --exclude '.venv' --exclude '.env' --exclude '.env.*'
  --exclude 'backend/uploads' --exclude 'uploads' --exclude 'backups'
  --exclude 'media' --exclude 'storage' --exclude '*.sqlite' --exclude '*.sqlite3' --exclude '*.db'
)
rsync -avn --delete "${RSYNC_EXCLUDES[@]}" -- "$SRC_DIR/" "$APP_DIR/"
CODE_CHANGED=1
rsync -av --delete "${RSYNC_EXCLUDES[@]}" -- "$SRC_DIR/" "$APP_DIR/"

echo "========== 4. 安装依赖并执行迁移，任一步失败即停止 =========="
PHASE=dependencies
(umask 022; "$PYTHON" -m pip install -r "$BACKEND_DIR/requirements.txt")
PHASE=migration
run_with_service_env -m app.manage upgrade
run_with_service_env -m app.manage check

echo "========== 5. 更新已核对的图片代理规则 =========="
PHASE=nginx
# Refuse to overwrite concurrent manual edits. Resolve the sites-enabled symlink
# above so the original file's ownership and permissions remain intact.
cmp -s -- "$NGINX_CONFIG" "$BACKUP_DIR/nginx.conf.before" || fail "Nginx 配置在更新期间被修改，未覆盖。"
cat -- "$BACKUP_DIR/nginx.conf.next" > "$NGINX_CONFIG"
if ! nginx -t; then
  cat -- "$BACKUP_DIR/nginx.conf.before" > "$NGINX_CONFIG"
  fail "新 Nginx 配置校验失败，已恢复原配置文件。"
fi
systemctl reload nginx

echo "========== 6. 启动并核对本机及域名就绪接口 =========="
PHASE=readiness
systemctl start "$APP_SERVICE"
READY=0
for attempt in {1..15}; do
  if curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8000/health/ready \
      | "$PYTHON" "$HELPER" ready; then
    READY=1
    break
  fi
  sleep 2
done
(( READY == 1 )) || fail "本机 readiness 未通过。"
curl --fail --silent --show-error --max-time 15 "${PUBLIC_URL%/}/health/ready" \
  | "$PYTHON" "$HELPER" ready
systemctl is-active --quiet "$APP_SERVICE"
printf '%s\n' "$TARGET_COMMIT" > "$APP_DIR/.deployed-commit"
touch "$BACKUP_DIR/DEPLOY_COMPLETE"
PHASE=complete
echo "更新成功：$BRANCH @ $TARGET_COMMIT"
echo "备份保留在：$BACKUP_DIR（不会自动清理）"
echo "请验证登录、借出/归还审批、拼音搜索与留痕图片。"

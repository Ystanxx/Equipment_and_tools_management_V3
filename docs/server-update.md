# 沿用服务器一键更新

适用于已核对的部署：Git 源码在 `/opt/equipment-app-src`，运行目录在 `/opt/equipment-app`，服务为 `equipment-app.service`，环境文件为 `/opt/equipment-app/.env`。`backend/uploads` 是指向 `/data/equipment-app/uploads` 的软链接。

一键更新仍然可用。修复分支暂未合并 main，这次执行时明确传入 `codex/review-hardening`。不要在运行目录中执行 git pull，也不要使用旧脚本中的 reset --hard。

## 一次安装修订后的脚本

在服务器以 root 执行。下面先取得脚本的固定提交副本，再替换 `/root/update-equipment-app.sh` 入口；旧入口会保留备份。此步骤只安装更新工具，尚不停止或更新业务服务。

```bash
(
set -Eeuo pipefail
cd /opt/equipment-app-src
git -c safe.directory=/opt/equipment-app-src fetch --no-tags origin \
  refs/heads/codex/review-hardening:refs/remotes/origin/codex/review-hardening
release=$(git -c safe.directory=/opt/equipment-app-src rev-parse origin/codex/review-hardening)
bundle="/root/equipment-updater/$release"
mkdir -p "$bundle"
chmod 700 /root/equipment-updater "$bundle"
git -c safe.directory=/opt/equipment-app-src show "$release:scripts/update-equipment-app.sh" > "$bundle/update-equipment-app.sh"
git -c safe.directory=/opt/equipment-app-src show "$release:scripts/deploy_support.py" > "$bundle/deploy_support.py"
bash -n "$bundle/update-equipment-app.sh"
if [ -f /root/update-equipment-app.sh ]; then
  cp -a /root/update-equipment-app.sh "/root/update-equipment-app.sh.bak.$(date +%Y%m%d-%H%M%S)"
fi
printf '#!/usr/bin/env bash\nset -Eeuo pipefail\nexec bash "%s/update-equipment-app.sh" "$@"\n' "$bundle" > /root/update-equipment-app.sh
chmod 700 /root/update-equipment-app.sh "$bundle/update-equipment-app.sh"
echo "更新工具已安装，来源提交：$release"
)
```

先查看该提交的 GitHub Actions 回归结果，再在维护窗口执行：

```bash
/root/update-equipment-app.sh codex/review-hardening
```

今后修复合并到 main 后，执行 `/root/update-equipment-app.sh` 即默认部署 main。更新工具本身有改动时，重新安装对应版本的脚本副本。

## 新脚本做什么

1. 检查依赖、运行目录、上传软链接和源码工作区。使用锁避免两次更新重叠；源码有未提交变更就退出，不覆盖修改。
2. 拉取明确分支，记录提交，不重写 Git 历史。运行目录仍通过 rsync 同步；源码目录采用固定提交的 detached HEAD，保留本地 main。
3. 在停服前验证 Nginx 配置并生成修改预案。如果 `/uploads/` 与本次核对的旧规则不同，会停止并要求核对，不泛化替换其他配置。
4. 停服后备份代码、虚拟环境、配置、数据库以及软链接指向的实际图片。备份在 **`/opt/equipment-app-backups/<时间>.随机后缀/`**，不会参与同步删除。使用 pg_dump，并以 pg_restore --list 检查归档可读取；这不代替定期恢复演练。
5. 同步排除 `.venv`、`.env`、`.env.*`、上传目录、`backups`、media/storage 与数据库文件；现有 `/opt/equipment-app/backups` 不会被 rsync --delete 删除。
6. 安装依赖，借助 systemd-run 读取与服务相同的 EnvironmentFile，执行 `app.manage upgrade` 和 `app.manage check`。不把 .env 当 shell 脚本执行，也不在命令行输出数据库密码。
7. 只把已确认的 `/uploads/` 静态 alias 改为授权代理；保留证书、域名、ACME 路由和现有 `/` 代理。现有 `/` 代理也会处理 `/static/`，不需要另建静态磁盘目录。`nginx -t` 通过才 reload。
8. 启动后同时检查本机与 `https://www.lily-lab.cn/health/ready` 的状态码和 JSON；仅成功后写入 `.deployed-commit` 及备份目录中的 `DEPLOY_COMPLETE`。

脚本不会合并分支、强推、自动删除旧备份或自动降级数据库。安装工具本身不代表业务更新成功。

## 失败时

- 停服前发现问题：保留原服务运行。
- 备份或源码切换失败、尚未同步运行目录：若原服务运行，尝试恢复原服务；数据库未迁移。
- 开始同步后失败（包括依赖、迁移、Nginx、readiness）：保持服务停止，输出失败阶段和备份路径，避免启动混合版本。不会把“迁移失败但服务能启动”当作成功。
- Nginx 修改后语法校验失败：恢复原配置文件，不 reload 错误配置。不要绕过检查继续启动。

```bash
journalctl -u equipment-app -n 100 --no-pager
```

备份目录中 `app/` 保留旧代码、环境、依赖和原上传软链接，`uploads/` 保留实际图片，`database.dump` 是 PostgreSQL 归档，`nginx.conf.before` 是原代理配置。`release.txt` 记录源码切换前后提交，旧运行版本若有 `.deployed-commit` 则随 `app/` 一起保存。只有存在 `BACKUP_COMPLETE` 才表示本次全部备份步骤已完成。

回滚先停服并分析失败阶段；不要直接执行数据库 downgrade 或覆盖数据库备份，否则会删除新表/覆盖备份后数据。新增迁移为增量式，回滚代码通常可保留新结构。回滚旧 Nginx alias 会重新开放图片静态访问，需要与应用版本一起审查。

## 验证范围

新增部署测试使用临时目录及模拟的 git/systemctl/rsync/数据库命令，覆盖成功路径、脏源码、锁冲突、拉取失败、备份失败、同步失败、依赖失败、迁移失败、Nginx 检查失败、健康检查失败；不会操作生产服务。辅助函数测试覆盖 Nginx 修改范围与幂等性、备份失败传播及凭据不出现在进程参数中。实际服务器执行结果仍需以上健康检查和业务检查确认。

```bash
bash -n scripts/update-equipment-app.sh
python -m unittest discover -s scripts/tests -v
```

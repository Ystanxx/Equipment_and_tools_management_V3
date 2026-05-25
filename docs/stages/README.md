# 器材管理系统 V3 — 分阶段实施文档

> 本目录包含系统五个实施阶段的详细文档，记录了每个阶段的目标、实现内容、关键文件路径和待办事项。
> 供后续接手团队快速了解项目现状和剩余工作。

---

## 总体进度

| 阶段 | 名称 | 状态 | 文档 |
|------|------|------|------|
| 一 | 基础框架 | ✅ 已完成 | [stage-1-foundation.md](stage-1-foundation.md) |
| 二 | 借出流程 | ✅ 已完成 | [stage-2-borrow-flow.md](stage-2-borrow-flow.md) |
| 三 | 归还流程 | ✅ 已完成 | [stage-3-return-flow.md](stage-3-return-flow.md) |
| 四 | 通知/审计/配置 | ⚠️ 部分完成 | [stage-4-notifications-audit-config.md](stage-4-notifications-audit-config.md) |
| 五 | 图片/清理/测试/UI | ⚠️ 部分完成 | [stage-5-image-cleanup-tests-ui.md](stage-5-image-cleanup-tests-ui.md) |

---

## 已完成功能总览

### 后端（FastAPI + SQLAlchemy + PostgreSQL）
- 16 个数据模型（用户、注册、分类、位置、设备、编号序列、附件、审计日志、借用单/明细/审批、归还单/明细/审批、系统配置）
- 16 个业务服务（认证、注册、用户、分类、位置、设备、编号、附件、审计、借出、借出审批、归还、归还审批、系统配置）
- 14 个 API 路由模块，统一前缀 `/api/v1`
- 11 个自动化测试文件
- Pillow 图片压缩（标准图+缩略图+EXIF移除）
- Alembic 数据库迁移

### 前端（原生 HTML + CSS + JavaScript）
- 13 个 JS 模块（api、router、utils、auth、dashboard、assets、borrow、return、categories、locations、users、audit、system_configs）
- 5 个 CSS 文件（variables、base、components、layout、pages）
- 20+ 个页面路由
- 角色差异化侧栏和仪表板
- 购物车式借用清单
- 照片 lightbox 全屏查看
- 模态框替代所有 prompt/confirm
- PC + 移动端响应式布局

---

## 剩余工作摘要

### 阶段四剩余（详见文档）
1. **站内通知系统** — Notification 模型、服务、API、前端通知中心页面
2. **邮件通知** — SMTP 邮件发送服务，触发点集成
3. **事件时间线** — 借用单/归还单详情页的完整事件时间线 UI
4. **个人中心页面** — 用户信息展示、修改密码、退出登录

### 阶段五剩余（详见文档）
1. **照片清理定时任务** — APScheduler 或 cron，按保留策略清理过期照片
2. **测试补齐** — 审计日志完整性、通知测试、清理策略测试

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | FastAPI |
| ORM | SQLAlchemy 2.x |
| 数据库 | PostgreSQL 17.6 |
| 迁移 | Alembic |
| 鉴权 | JWT (python-jose) |
| 图片处理 | Pillow |
| 前端 | 原生 HTML + CSS + JavaScript（无构建工具） |
| 部署 | 阿里云 2C2G |

---

## 项目结构

```
Equipment_and_tools_management_V3/
├── backend/
│   ├── app/
│   │   ├── api/          # API 路由（14 个模块 + router.py）
│   │   ├── core/         # 配置、数据库、安全
│   │   ├── models/       # SQLAlchemy 模型（16 个）
│   │   ├── schemas/      # Pydantic 请求/响应 Schema
│   │   ├── services/     # 业务服务（16 个）
│   │   ├── utils/        # 枚举、拼音工具
│   │   └── main.py       # FastAPI 应用入口
│   ├── tests/            # pytest 自动化测试（11 个文件）
│   ├── uploads/          # 图片存储目录
│   ├── alembic/          # 数据库迁移
│   └── .env              # 环境变量
├── frontend/
│   ├── css/              # 5 个样式文件
│   ├── js/               # 13 个 JS 模块
│   └── index.html        # SPA 入口
└── docs/
    ├── stages/           # 本目录：分阶段实施文档
    ├── 器材管理系统V3需求规格说明书.md
    ├── UI_preview.pdf
    └── equipment_manage_ui_design.pen
```

---

## 规格书参考

完整需求规格说明书：[器材管理系统V3需求规格说明书.md](../器材管理系统V3需求规格说明书.md)

分阶段实施建议位于规格书 **§19.2**。

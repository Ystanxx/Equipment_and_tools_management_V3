# 阶段四：通知、审计日志、时间线、系统配置

> **状态：⚠️ 部分完成**
> **对应规格书：§19.2 第四阶段、§10 通知策略、§11 审计与留痕、§16 系统配置**

---

## 1. 阶段目标

为系统补充完整的通知能力（站内通知 + 邮件通知）、事件时间线展示、审计日志查询，以及可配置的系统参数管理。

---

## 2. 范围清单

| 功能项 | 状态 | 说明 |
|--------|------|------|
| 审计日志后端 | ✅ | Service 层统一写入，关键动作全覆盖 |
| 审计日志前端 | ✅ | 超管可查看日志列表，支持按动作类型筛选 |
| 系统配置后端 | ✅ | 14 项配置定义，含借用规则、图片策略、通知开关 |
| 系统配置前端 | ✅ | 超管可编辑配置，分组展示，保存即生效 |
| **邮件通知** | ❌ | **未实现**：无邮件发送服务，无邮件模板 |
| **站内通知** | ❌ | **未实现**：无 Notification 模型、服务、API、前端页面 |
| **通知中心页面** | ❌ | **未实现**：前端无通知中心路由 |
| **事件时间线** | ❌ | **未实现**：借用单/归还单详情页无完整事件时间线 |

---

## 3. 已完成部分

### 3.1 审计日志

**后端：**
- 模型：`backend/app/models/audit_log.py` — operator_id, action, target_type, target_id, description, snapshot, created_at
- 服务：`backend/app/services/audit_service.py` — `log()` 统一写入方法
- API：`backend/app/api/audit_logs.py` — GET 列表（分页、按 action 筛选）
- 已记录的动作类型：注册审核、设备创建/编辑、管理员变更、借用单创建/审批/交付/取消、归还单创建/审批、附件上传、系统配置变更

**前端：**
- 路由：`audit-logs` in `frontend/js/audit.js`
- 仅超管可访问，支持按动作类型下拉筛选 + 分页

### 3.2 系统配置

**后端：**
- 模型：`backend/app/models/system_config.py` — key, value, description, updated_by, updated_at
- 服务：`backend/app/services/system_config_service.py` — 14 项 ConfigDefinition，含类型校验、范围校验、序列化
- API：`backend/app/api/system_configs.py` — GET 列表、PUT 批量更新
- 配置分组：borrow（借用规则 3 项）、photo（图片策略 8 项）、notification（通知开关 2 项）

**前端：**
- 路由：`system-configs` in `frontend/js/system_configs.js`
- 超管专用，按组分卡片展示，支持 bool/int/select 类型编辑
- 前端启动时通过 `Api.bootstrapSystemConfigs()` 缓存公共配置到 localStorage

### 3.3 自动化测试

| 测试文件 | 覆盖内容 |
|----------|----------|
| `backend/tests/test_system_configs.py` | 配置读取、更新、校验 |

---

## 4. 未完成部分 — TODO

### 4.1 站内通知系统（❌ 需新建）

**需求概述（规格书 §10）：**
站内通知需在以下事件触发时生成通知记录，用户可在通知中心查看。

**触发点：**
- 用户提交注册申请 → 通知超管
- 超管审核注册结果 → 通知用户
- 用户提交借用单 → 通知对应管理员
- 管理员审批借用结果 → 通知用户
- 借用单全部通过 → 通知用户可领取
- 用户提交归还单 → 通知对应管理员
- 管理员审批归还结果 → 通知用户
- 丢失/损坏 → 通知超管

**后端需实现：**

1. **模型** `backend/app/models/notification.py`
   ```
   Notification:
     id: UUID
     recipient_id: UUID (FK → users)
     title: str
     content: str
     notification_type: str (REGISTRATION, BORROW, RETURN, SYSTEM)
     related_type: str (可选，如 BorrowOrder, ReturnOrder)
     related_id: UUID (可选)
     is_read: bool (默认 false)
     created_at: datetime
   ```

2. **服务** `backend/app/services/notification_service.py`
   - `create_notification(db, recipient_id, title, content, type, related_type, related_id)`
   - `mark_as_read(db, notification_id, user)`
   - `mark_all_as_read(db, user)`
   - `get_unread_count(db, user_id)`
   - 在各业务 Service 中调用（注册审核、借出审批、归还审批等）
   - 受系统配置 `enable_in_app_notifications` 控制

3. **API** `backend/app/api/notifications.py`
   - GET `/notifications` — 当前用户通知列表（分页）
   - GET `/notifications/unread-count` — 未读计数
   - POST `/notifications/{id}/read` — 标记已读
   - POST `/notifications/read-all` — 全部已读

4. **路由注册** — 在 `backend/app/api/router.py` 中添加 notifications_router

**前端需实现：**

1. **API 方法** — 在 `frontend/js/api.js` 中添加通知相关接口
2. **通知中心页面** — 新路由 `notifications`，列表展示 + 已读/未读筛选
3. **未读徽标** — Dashboard 侧栏或顶栏显示未读通知数
4. **通知铃铛** — 页面头部添加通知入口图标

### 4.2 邮件通知（❌ 需新建）

**需求概述（规格书 §10.1）：**
V1 至少支持邮件通知渠道。

**后端需实现：**

1. **邮件服务** `backend/app/services/email_service.py`
   - 使用 `aiosmtplib` 或 `smtplib` 发送邮件
   - SMTP 配置从环境变量/`.env` 读取
   - 邮件模板（纯文本或简单 HTML）
   - 受系统配置 `enable_email_notifications` 控制

2. **环境变量** — 在 `.env` 中添加：
   ```
   SMTP_HOST=
   SMTP_PORT=587
   SMTP_USER=
   SMTP_PASSWORD=
   SMTP_FROM=
   SMTP_TLS=true
   ```

3. **触发集成** — 在 `notification_service.py` 中，创建站内通知的同时可选发送邮件

### 4.3 事件时间线（❌ 需新建）

**需求概述：**
在借用单详情和归还单详情页展示完整的事件时间线。

**实现方案：**
- 后端：通过查询审计日志（按 target_type + target_id 筛选）聚合时间线数据
- 或在详情 API 中增加 `timeline` 字段
- 前端：在借用单/归还单详情的 content-side 区域添加时间线卡片

**时间线事件示例：**
- 2024-01-01 10:00 用户A 提交借用单
- 2024-01-01 11:00 管理员B 审批通过（3 件设备）
- 2024-01-01 14:00 管理员B 确认交付
- 2024-01-05 09:00 用户A 提交归还单

### 4.4 个人中心页面（❌ 需新建）

**需求概述（规格书 §12.2 公共页面）：**
- 查看个人信息（用户名、邮箱、角色、注册时间）
- 修改密码（可选）
- 退出登录

---

## 5. 接班说明

- 审计日志已全面集成到各 Service 层，新增业务只需调用 `audit_service.log()` 即可
- 系统配置已预定义 `enable_in_app_notifications` 和 `enable_email_notifications` 开关，通知服务实现后直接读取即可
- 通知系统建议以"通知事件"方式触发（规格书 §10.3），方便后续接入企业微信/钉钉
- 邮件通知属于可选增强，如部署环境无 SMTP 可先关闭 `enable_email_notifications`
- 时间线数据可复用审计日志，按 related_id 查询即可聚合

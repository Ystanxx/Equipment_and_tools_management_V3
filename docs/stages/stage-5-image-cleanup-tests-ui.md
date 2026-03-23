# 阶段五：图片处理、照片清理、自动化测试、UI 联调

> **状态：⚠️ 部分完成**
> **对应规格书：§19.2 第五阶段、§9 附件与照片策略、§17.5 可测试性要求**

---

## 1. 阶段目标

完善图片上传时的压缩与缩略图生成、实现照片滚动清理定时任务、补齐自动化测试、全面 UI 联调与体验修正。

---

## 2. 范围清单

| 功能项 | 状态 | 说明 |
|--------|------|------|
| 图片压缩 | ✅ | Pillow 处理：EXIF 移除、长边缩放、标准图+缩略图生成 |
| 压缩参数可配置 | ✅ | 系统配置控制格式/质量/尺寸（photo_target_format, photo_standard_max_edge 等） |
| 上传大小校验 | ✅ | 受系统配置 photo_max_upload_mb 控制 |
| 上传类型校验 | ✅ | 仅允许 image/jpeg, image/png, image/webp |
| 上传上下文权限校验 | ✅ | 按 photo_type 校验关联对象和操作权限 |
| **照片清理定时任务** | ❌ | **未实现**：无调度器，无清理逻辑 |
| 自动化测试 — 认证注册 | ✅ | test_auth.py, test_registration.py |
| 自动化测试 — 设备与编号 | ✅ | test_assets.py, test_asset_number.py |
| 自动化测试 — 借出端到端 | ✅ | test_borrow_flow.py, test_borrow_e2e.py |
| 自动化测试 — 归还端到端 | ✅ | test_return_e2e.py |
| 自动化测试 — 附件处理 | ✅ | test_attachments.py, test_attachment_processing.py |
| 自动化测试 — 系统配置 | ✅ | test_system_configs.py |
| 自动化测试 — SPA 路由 | ✅ | test_spa_fallback.py |
| **自动化测试 — 通知** | ❌ | **未实现**（依赖阶段四通知系统） |
| **自动化测试 — 审计日志验证** | ❌ | **未覆盖**：缺少专门的审计日志写入完整性测试 |
| UI 联调 — 角色差异化侧栏 | ✅ | SuperAdmin / AssetAdmin 不同导航菜单和分区标签 |
| UI 联调 — 角色差异化仪表板 | ✅ | SuperAdmin 看全局统计+注册审核，AssetAdmin 看设备+审批 |
| UI 联调 — 必填标记 | ✅ | form-required 样式，借用用途/照片、归还照片、资产表单必填字段 |
| UI 联调 — 照片画廊 | ✅ | photo-gallery CSS 类 + lightbox 全屏查看 |
| UI 联调 — 移动端导航 | ✅ | 底部导航栏、返回栏（mobile-back-bar） |
| UI 联调 — 模态替换 | ✅ | 所有 prompt()/confirm() 替换为模态框 |
| **UI — 个人中心** | ❌ | **未实现**（规格书 §12.2 公共页面要求） |
| **UI — 通知中心** | ❌ | **未实现**（依赖阶段四通知系统） |

---

## 3. 已完成部分

### 3.1 图片压缩服务

**核心文件：** `backend/app/services/attachment_service.py`

处理流程：
1. 校验 MIME 类型（仅 jpeg/png/webp）
2. 校验文件大小（系统配置 photo_max_upload_mb）
3. 校验上传上下文（photo_type + related_type + 权限）
4. Pillow 处理：
   - `ImageOps.exif_transpose()` — 移除 EXIF 并自动旋转
   - `thumbnail()` — 按配置长边缩放标准图
   - `thumbnail()` — 按配置长边缩放缩略图
   - 格式转换（JPEG/PNG/WEBP）
5. 保存标准图 + 缩略图到 `backend/uploads/{photo_type}/{YYYY-MM}/`
6. 写入 Attachment 记录 + 审计日志

**可配置参数（系统配置）：**

| 配置键 | 默认值 | 说明 |
|--------|--------|------|
| photo_max_upload_mb | 10 | 单文件上传上限(MB) |
| photo_target_format | JPEG | 标准化保存格式 |
| photo_standard_max_edge | 1600 | 标准图最长边(px) |
| photo_standard_quality | 82 | 标准图压缩质量 |
| photo_thumb_max_edge | 360 | 缩略图最长边(px) |

### 3.2 自动化测试

**现有测试文件：**

| 文件 | 内容 |
|------|------|
| `backend/tests/conftest.py` | 测试 fixtures：测试数据库、客户端、用户创建 |
| `backend/tests/test_auth.py` | 注册、登录、JWT |
| `backend/tests/test_registration.py` | 注册审核通过/驳回 |
| `backend/tests/test_assets.py` | 设备 CRUD、管理员绑定 |
| `backend/tests/test_asset_number.py` | 编号生成 |
| `backend/tests/test_borrow_flow.py` | 借用单创建、审批拆分 |
| `backend/tests/test_borrow_e2e.py` | 借用端到端流程 |
| `backend/tests/test_return_e2e.py` | 归还端到端流程 |
| `backend/tests/test_attachments.py` | 附件上传 API |
| `backend/tests/test_attachment_processing.py` | 图片压缩处理逻辑 |
| `backend/tests/test_system_configs.py` | 系统配置读写 |
| `backend/tests/test_spa_fallback.py` | SPA 路由 fallback |

**运行方式：**
```bash
cd backend
pytest tests/ -v
```

### 3.3 UI 联调成果

- **侧栏**：SuperAdmin 显示"系统管理 / 设备管理 / 业务处理"分区；AssetAdmin 显示"设备管理 / 审批处理 / 订单查看"分区
- **仪表板**：按角色展示不同统计卡片和快捷操作
- **必填验证**：借用用途+照片、归还逐件照片、资产创建照片/分类/位置/管理员
- **照片查看**：统一 `photo-gallery` 样式 + `Utils.openLightbox()` 全屏查看
- **移动端**：底部导航栏（首页/设备/借用/归还）、返回栏
- **模态框**：审批通过/驳回、分类停用、位置停用、用户停用/启用、注册驳回 — 全部使用模态对话框

---

## 4. 未完成部分 — TODO

### 4.1 照片清理定时任务（❌ 需新建）

**需求概述（规格书 §9.4 - §9.6）：**

照片清理不在上传时执行，而是通过定时任务按保留策略清理。

**清理策略：**

| 照片类型 | 策略 | 默认配置 |
|----------|------|----------|
| INVENTORY（库存照片） | 按每个设备滚动保留 N 组 | inventory_photo_keep_count = 5 |
| BORROW_ORDER（借出照片） | 按时间保留 | borrow_photo_keep_days = 180 |
| RETURN_ITEM（归还照片） | 按时间保留 | return_photo_keep_days = 365 |
| INCIDENT（异常照片） | 事件关闭后按时间保留 | incident_photo_keep_days = 365 |

**后端需实现：**

1. **清理服务** `backend/app/services/photo_cleanup_service.py`
   - `cleanup_inventory_photos(db)` — 按设备分组，保留最新 N 条，删除多余
   - `cleanup_borrow_photos(db)` — 删除超过保留天数的借出照片
   - `cleanup_return_photos(db)` — 删除超过保留天数的归还照片
   - `cleanup_incident_photos(db)` — 跳过未关闭事件，删除已关闭且超期的
   - 同时删除数据库记录和磁盘文件
   - 受系统配置 `photo_cleanup_enabled` 控制

2. **定时调度** — 推荐方案：
   - 方案 A：使用 APScheduler，在 FastAPI lifespan 中注册定时任务
   - 方案 B：使用独立脚本 + 系统 cron
   - 方案 C：使用 FastAPI BackgroundTasks 结合简单 sleep 循环

   推荐方案 A（APScheduler），添加到 `backend/app/main.py` 的 lifespan 中。

3. **日志** — 清理执行时写入审计日志或 Python logger

### 4.2 测试补齐

**规格书 §17.5 要求但尚未覆盖的测试：**

| 测试项 | 当前状态 | 说明 |
|--------|----------|------|
| 审计日志写入完整性 | ❌ | 验证各业务操作后审计日志是否正确写入 |
| 照片清理策略 | ❌ | 依赖清理服务实现后编写 |
| 通知创建与查询 | ❌ | 依赖阶段四通知系统实现后编写 |
| 部分归还场景 | ⚠️ | test_return_e2e.py 是否覆盖需确认 |
| 损坏/丢失归还 | ⚠️ | test_return_e2e.py 是否覆盖需确认 |

### 4.3 个人中心（❌ 需新建）

**需求（规格书 §12.2）：**
- 展示个人信息：用户名、邮箱、姓名、角色、注册时间
- 修改密码（可选 V1）
- 退出登录按钮

**实现方案：**
- 新路由 `profile` in `frontend/js/auth.js` 或独立文件
- 后端已有 `GET /auth/me` 返回用户信息
- 如需修改密码，后端增加 `PUT /auth/password` 端点

---

## 5. 接班说明

- 图片压缩完全在 `attachment_service.py` 中封装，参数全部走系统配置
- 照片存储路径规则：`uploads/{photo_type}/{YYYY-MM}/{uuid}.jpg`，缩略图后缀 `_thumb`
- 系统配置已预定义所有清理相关参数（keep_count / keep_days），实现清理服务时直接读取
- 测试使用 pytest + FastAPI TestClient，fixtures 在 `conftest.py`
- UI 改动集中在 `frontend/js/` 和 `frontend/css/` 目录，无构建工具，直接原生 JS
- 所有 `window.open` 照片查看已替换为 lightbox，所有 `prompt()/confirm()` 已替换为模态框

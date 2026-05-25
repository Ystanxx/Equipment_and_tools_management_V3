# 阶段一：基础框架

> **状态：✅ 已完成**
> **对应规格书：§19.2 第一阶段**

---

## 1. 阶段目标

搭建系统核心骨架，完成用户体系、设备主数据、分类与位置管理、编号生成服务，为后续借还业务提供基础支撑。

---

## 2. 范围清单

| 功能项 | 状态 | 说明 |
|--------|------|------|
| 用户自助注册 | ✅ | 注册后状态为 PENDING，需超管审核 |
| 超管审核注册 | ✅ | 通过/驳回，驳回可填原因 |
| 登录鉴权（JWT） | ✅ | 密码哈希，Token 鉴权，401 自动跳转登录 |
| 角色基础框架 | ✅ | USER / ASSET_ADMIN / SUPER_ADMIN 三角色 |
| 分类管理 | ✅ | CRUD + 停用，独立建模 |
| 位置管理 | ✅ | CRUD + 停用，独立建模 |
| 设备/工具主数据 | ✅ | 创建、编辑、列表、详情，含品牌/型号/序列号等字段 |
| 编号生成服务 | ✅ | 拼音首字母前缀 + 全局递增流水号，独立服务封装 |
| 超管创建设备指定管理员 | ✅ | 超管必选管理员，设备管理员自动绑定自己 |
| 审计日志（基础写入） | ✅ | 关键动作写入审计日志，Service 层统一调用 |

---

## 3. 后端实现

### 3.1 数据模型

| 模型文件 | 说明 |
|----------|------|
| `backend/app/models/user.py` | 用户表：username, email, hashed_password, full_name, role, status |
| `backend/app/models/registration_request.py` | 注册申请表：user_id, status, reject_reason |
| `backend/app/models/asset_category.py` | 分类表：name, is_active |
| `backend/app/models/storage_location.py` | 位置表：name, building, room, cabinet, shelf, remark, is_active |
| `backend/app/models/asset.py` | 设备主表：name, asset_code, asset_type, category_id, location_id, admin_id, status, brand, model, serial_number, description, entry_date, remark |
| `backend/app/models/asset_number_seq.py` | 编号序列表：prefix, next_seq（保证全局唯一递增） |
| `backend/app/models/audit_log.py` | 审计日志表：operator_id, action, target_type, target_id, description, snapshot |

### 3.2 业务服务

| 服务文件 | 说明 |
|----------|------|
| `backend/app/services/auth_service.py` | 注册、登录、密码校验、JWT 生成 |
| `backend/app/services/registration_service.py` | 注册审核通过/驳回，状态流转 |
| `backend/app/services/user_service.py` | 用户列表、角色变更、状态变更 |
| `backend/app/services/category_service.py` | 分类 CRUD + 停用 |
| `backend/app/services/location_service.py` | 位置 CRUD + 停用 |
| `backend/app/services/asset_service.py` | 设备 CRUD、管理员绑定、编号调用 |
| `backend/app/services/asset_number_service.py` | 拼音首字母提取 + 流水号递增 |
| `backend/app/services/audit_service.py` | 审计日志统一写入 |

### 3.3 API 路由

| 路由文件 | 前缀 | 说明 |
|----------|------|------|
| `backend/app/api/auth.py` | `/auth` | 注册、登录、获取当前用户 |
| `backend/app/api/registration_requests.py` | `/registration-requests` | 列表、通过、驳回（require_super_admin） |
| `backend/app/api/users.py` | `/users` | 用户列表、角色变更、状态变更 |
| `backend/app/api/asset_categories.py` | `/asset-categories` | 分类 CRUD |
| `backend/app/api/storage_locations.py` | `/storage-locations` | 位置 CRUD |
| `backend/app/api/assets.py` | `/assets` | 设备 CRUD、管理员变更 |

### 3.4 核心工具

| 文件 | 说明 |
|------|------|
| `backend/app/utils/enums.py` | 全局枚举：UserRole, UserStatus, AssetType, AssetStatus 等 |
| `backend/app/utils/pinyin_utils.py` | 中文拼音首字母提取 |
| `backend/app/core/config.py` | 系统配置（环境变量） |
| `backend/app/core/database.py` | SQLAlchemy 引擎与 Session 工厂 |
| `backend/app/core/security.py` | JWT 编解码、密码哈希 |

---

## 4. 前端实现

### 4.1 页面路由

| 路由名 | 文件 | 说明 |
|--------|------|------|
| `login` | `frontend/js/auth.js` | 登录页，PC/移动端自适应 |
| `register` | `frontend/js/auth.js` | 注册页 |
| `pending` | `frontend/js/auth.js` | 注册审核中等待页 |
| `dashboard` | `frontend/js/dashboard.js` | 角色差异化工作台 |
| `asset-list` | `frontend/js/assets.js` | 设备列表（含搜索、状态筛选） |
| `asset-detail` | `frontend/js/assets.js` | 设备详情（含库存照片、管理员分配） |
| `asset-form` | `frontend/js/assets.js` | 设备新建/编辑表单 |
| `categories` | `frontend/js/categories.js` | 分类管理 |
| `locations` | `frontend/js/locations.js` | 位置管理 |
| `user-mgmt` | `frontend/js/users.js` | 用户管理 + 注册审核 |

### 4.2 公共模块

| 文件 | 说明 |
|------|------|
| `frontend/js/api.js` | API 客户端，封装所有后端接口调用 |
| `frontend/js/router.js` | Hash 路由，鉴权守卫，待审核用户拦截 |
| `frontend/js/utils.js` | 工具函数：状态映射、日期格式化、HTML 转义、Toast、SVG 图标、Lightbox |

### 4.3 样式文件

| 文件 | 说明 |
|------|------|
| `frontend/css/variables.css` | 设计令牌（颜色、圆角、间距、阴影） |
| `frontend/css/base.css` | 全局重置、排版、工具类 |
| `frontend/css/components.css` | 按钮、表单、芯片、表格、模态框、Toast |
| `frontend/css/layout.css` | PC 侧栏 + 主内容布局、移动端底部导航 |
| `frontend/css/pages.css` | 页面级样式（登录、资产卡片、筛选条、仪表板、用户行） |

---

## 5. 自动化测试

| 测试文件 | 覆盖内容 |
|----------|----------|
| `backend/tests/test_auth.py` | 注册、登录、JWT 鉴权 |
| `backend/tests/test_registration.py` | 注册审核通过/驳回 |
| `backend/tests/test_assets.py` | 设备创建、管理员绑定 |
| `backend/tests/test_asset_number.py` | 编号生成规则、前缀、递增 |
| `backend/tests/test_spa_fallback.py` | SPA 前端静态文件 fallback |

---

## 6. 接班说明

- 本阶段所有功能已落地并经过浏览器手工测试
- 编号生成服务独立封装于 `asset_number_service.py`，后续如需调整前缀规则只改此文件
- 角色权限通过 `require_super_admin` / `require_admin_or_super` 依赖注入实现，后续如需细粒度权限可在此层扩展
- 数据库迁移使用 Alembic，所有模型变更需生成迁移脚本

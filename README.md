# 器材管理系统 V3

面向实验室、课题组和小型设备中心的器材借用与归还管理系统。  
项目同时提供 **PC端管理后台** 和 **移动端操作界面**，覆盖器材借用、审批、交付、归还、入库、通知、审计和图片存档等完整闭环。

## 核心能力

- 统一订单闭环：提交借用单、借出审批、确认交付、提交归还、归还审批、确认入库、订单完成
- 多角色权限：普通用户、设备管理员、超级管理员
- 资产主数据管理：资产性质、业务分类、存放位置
- 器材台账管理：器材列表、详情、编辑、库存照片
- 审批工作台：借出审批、归还审批、历史筛选、审批面板
- 通知与审计：站内通知、邮件偏好、审计日志
- 图片处理：上传校验、标准化压缩、缩略图、临时附件超时清理
- 多端适配：PC 端侧栏工作台、移动端顶部滑动菜单与弹出式编辑

## 技术栈

### 后端

- FastAPI
- SQLAlchemy 2.x
- Alembic
- PostgreSQL
- Psycopg 3
- APScheduler
- Pillow

### 前端

- 原生 HTML / CSS / JavaScript
- Hash Router 单页应用
- 后端直接托管静态资源

### 鉴权与安全

- JWT
- `python-jose`
- `passlib` + `bcrypt`

## 当前角色能力

### 普通用户

- 器材借用
- 提交借用单
- 查看我的订单
- 接收通知
- 维护个人资料与密码

### 设备管理员

- 具备普通用户全部能力
- 查看并维护自己负责的器材
- 处理自己负责器材的借出审批
- 处理自己负责器材的归还审批

### 超级管理员

- 具备普通用户全部能力
- 查看并维护全部器材
- 管理资产性质、业务分类、位置、最近删除
- 查看全部借出/归还审批
- 用户管理、系统配置、审计日志

## 业务流程

```text
器材借用
  -> 提交借用单
  -> 借出审批
  -> 确认交付
  -> 借用中
  -> 提交归还
  -> 归还审批
  -> 确认入库
  -> 已完成
```

## 项目结构

```text
.
├── backend
│   ├── alembic
│   ├── app
│   │   ├── api          # 接口层
│   │   ├── core         # 配置、数据库、安全
│   │   ├── models       # 数据模型
│   │   ├── schemas      # 请求/响应模型
│   │   ├── services     # 业务服务
│   │   └── utils        # 枚举、工具函数
│   ├── tests            # 后端自动化测试
│   ├── uploads          # 上传文件目录
│   └── requirements.txt
├── frontend
│   ├── css
│   ├── js
│   └── index.html
├── docs
├── tests
├── requirements.txt
└── README.md
```

## 数据库概览

关键数据表按职责可分为：

### 用户与权限

- `users`
- `registration_requests`

### 基础主数据

- `asset_types`：资产性质
- `asset_categories`：业务分类
- `storage_locations`：位置
- `system_configs`：系统配置

### 业务主链路

- `assets`
- `equipment_orders`
- `borrow_orders`
- `borrow_order_items`
- `return_orders`
- `return_order_items`

### 审批与通知

- `borrow_approval_tasks`
- `return_approval_tasks`
- `notifications`
- `audit_logs`

### 附件

- `attachments`

## 环境要求

- Python 3.12
- PostgreSQL 16.x

## 本地启动

### 1. 安装依赖

在项目根目录执行：

```bash
pip install -r requirements.txt
```

或在后端目录执行：

```bash
cd backend
pip install -r requirements.txt
```

### 2. 配置环境变量

在 `backend` 目录下准备 `.env`：

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/equipment_mgmt
SECRET_KEY=change-me-to-a-random-secret-key
ACCESS_TOKEN_EXPIRE_MINUTES=480
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD=admin
SUPER_ADMIN_EMAIL=admin@example.com
UPLOAD_DIR=./uploads
```

### 3. 初始化数据库

先创建数据库：

```sql
CREATE DATABASE equipment_mgmt;
```

然后执行迁移：

```bash
cd backend
alembic upgrade head
```

### 4. 启动应用

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

如果本机 `8000` 已被占用，可改为：

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

### 5. 访问地址

- 首页：`http://localhost:8000/`
- API 文档：`http://localhost:8000/docs`

默认超级管理员：

- 用户名：`admin`
- 密码：`admin`

## 图片上传说明

- 图片不直接写入数据库，数据库只存路径与元数据
- 后端会对图片进行格式校验、压缩、标准化处理和缩略图生成
- 上传文件默认落到 `backend/uploads`
- 临时上传的附件如果 **10 分钟** 内没有后续提交，会自动清理

## 自动化测试

### 最小测试

```bash
cd backend
pytest tests/test_main_seed.py -q
```

### 全量测试

```bash
cd backend
pytest tests -q
```

如果本地测试库密码不是默认值，请显式指定：

```bash
TEST_DATABASE_URL=postgresql+psycopg://postgres:你的密码@localhost:5432/equipment_mgmt_test pytest tests -q
```

## 当前状态

当前仓库已经完成：

- PC / 移动端双端统一体验
- 统一订单闭环
- 属性管理与位置管理
- 借出/归还审批面板
- 图片上传稳定性优化
- 超级管理员启动幂等种子修复

适合作为继续部署、联调和上线前整理的基线版本。

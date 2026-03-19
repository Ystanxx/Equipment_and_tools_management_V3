# 器材管理系统 V3 — Equipment Management System

研究组内部设备借还管理系统，支持设备台账、借出归还、审批流程、照片存档与审计日志。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | FastAPI + SQLAlchemy 2.x + PostgreSQL 17.6 |
| 前端 | 原生 HTML + CSS + JS（自定义设计系统，暖色调） |
| 鉴权 | JWT (python-jose + passlib) |
| 迁移 | Alembic |
| 编号 | pypinyin 拼音首字母自动生成 |

## 快速开始

### 1. 环境准备

- Python 3.11+
- PostgreSQL 17.x

### 2. 数据库

```sql
CREATE DATABASE equipment_mgmt;
```

### 3. 后端

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # 按需修改数据库连接等配置

# 数据库迁移
alembic revision --autogenerate -m "initial"
alembic upgrade head

# 启动
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. 访问

- 前端：http://localhost:8000/
- API 文档：http://localhost:8000/docs
- 默认超管：`admin` / `admin`

## 项目结构

```
backend/
├── app/
│   ├── api/          # 路由层
│   ├── core/         # 配置、数据库、安全、依赖
│   ├── models/       # SQLAlchemy 模型
│   ├── schemas/      # Pydantic 模式
│   ├── services/     # 业务逻辑层
│   └── utils/        # 工具函数（枚举、拼音）
├── alembic/          # 数据库迁移
├── tests/            # 测试
└── requirements.txt

frontend/
├── css/              # 设计系统 CSS（变量、基础、组件、布局、页面）
├── js/               # SPA 路由 + 各页面逻辑
└── index.html        # SPA 入口
```

## 第一阶段已实现

- 用户注册 → 管理员审核 → 登录
- JWT 鉴权 + 三级角色（普通用户 / 设备管理员 / 超级管理员）
- 设备/工具 CRUD + 拼音首字母编号自动生成
- 分类、存放位置管理
- 用户管理 + 角色切换
- 响应式前端（移动端卡片流 / PC 侧边栏布局）
- 暖色调设计系统（匹配 .pen UI 稿）

## 测试

```bash
# 需要先创建测试数据库
# CREATE DATABASE equipment_mgmt_test;
cd backend
pytest tests/ -v
```

## 后续阶段

- **第二阶段**：借用清单 → 借出单 → 审批任务拆分
- **第三阶段**：归还流程 → 逐件拍照 → 异常标记
- **第四阶段**：审计日志 → 报表 → 通知
- **第五阶段**：图片压缩/水印 → 定时清理 → 部署优化

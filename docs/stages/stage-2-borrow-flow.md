# 阶段二：借出流程

> **状态：✅ 已完成**
> **对应规格书：§19.2 第二阶段、§7.2 借出流程、§8 审批模型**

---

## 1. 阶段目标

实现完整的设备借出业务闭环：用户浏览库存 → 加入借用清单 → 提交借用单（含照片） → 管理员按设备归属自动拆分审批 → 审批通过 → 确认交付。

---

## 2. 范围清单

| 功能项 | 状态 | 说明 |
|--------|------|------|
| 借用清单（购物车） | ✅ | 客户端 localStorage 实现，最多 20 件（可配置） |
| 提交借用单 | ✅ | 创建借用单 + 自动拆分审批任务 |
| 借用说明/用途 | ✅ | 前端必填（UI 强制），后端可通过系统配置控制 |
| 借出整单照片上传 | ✅ | 前端必填验证，提交后上传至附件服务 |
| 审批任务自动拆分 | ✅ | 按设备所属管理员自动生成独立审批任务 |
| 管理员审批通过/驳回 | ✅ | 带审批意见的模态框，支持行内快速审批 |
| 超管兜底审批 | ✅ | 超管可审批任意任务 |
| 确认交付 | ✅ | 管理员/超管确认线下交付，设备状态变 BORROWED |
| 取消借用单 | ✅ | 用户在待审核状态可取消 |
| 借用单列表 | ✅ | 支持状态筛选，PC 表格 + 移动端卡片 |
| 借用单详情 | ✅ | 明细、照片、审批进度、时间线基础信息 |
| 审批任务列表 | ✅ | 管理员专用，按状态筛选 |

---

## 3. 后端实现

### 3.1 数据模型

| 模型文件 | 说明 |
|----------|------|
| `backend/app/models/borrow_order.py` | 借用单：order_no, applicant_id, purpose, remark, status, expected_return_date, delivered_at |
| `backend/app/models/borrow_order_item.py` | 借用明细：order_id, asset_id, 快照字段（asset_code_snapshot, asset_name_snapshot, admin_name_snapshot, location_name_snapshot） |
| `backend/app/models/borrow_approval_task.py` | 审批任务：order_id, approver_id, item_ids(JSON), status, comment, decided_at |

### 3.2 业务服务

| 服务文件 | 关键方法 | 说明 |
|----------|----------|------|
| `backend/app/services/borrow_service.py` | `create_borrow_order()` | 创建借用单 + 明细 + 审批任务拆分，设备状态→PENDING_BORROW_APPROVAL |
| | `deliver_borrow_order()` | 确认交付，设备状态→BORROWED |
| | `cancel_borrow_order()` | 取消借用单，恢复设备状态→IN_STOCK |
| `backend/app/services/borrow_approval_service.py` | `approve_task()` | 通过审批，检查是否全部通过 |
| | `reject_task()` | 驳回审批 |

### 3.3 API 路由

| 路由文件 | 前缀 | 关键端点 |
|----------|------|----------|
| `backend/app/api/borrow_orders.py` | `/borrow-orders` | POST 创建、GET 列表、GET 详情、POST deliver、POST cancel |
| `backend/app/api/borrow_approvals.py` | `/borrow-approval-tasks` | GET 列表、POST approve、POST reject |

### 3.4 状态流转

```
创建 → PENDING_APPROVAL
       ├→ 部分审批通过 → PARTIALLY_APPROVED
       ├→ 全部通过 → APPROVED → READY_FOR_PICKUP → 交付 → DELIVERED
       ├→ 驳回 → REJECTED
       └→ 取消 → CANCELLED

设备状态：IN_STOCK → PENDING_BORROW_APPROVAL → BORROWED
```

---

## 4. 前端实现

### 4.1 页面路由

| 路由名 | 文件 | 说明 |
|--------|------|------|
| `borrow-cart` | `frontend/js/borrow.js` | 借用清单确认页，含用途输入、照片上传、提交 |
| `my-orders` | `frontend/js/borrow.js` | 我的借用单列表，支持状态筛选 |
| `borrow-detail` | `frontend/js/borrow.js` | 借用单详情：明细表格、借出照片、审批进度、行内审批按钮 |
| `borrow-approvals` | `frontend/js/borrow.js` | 管理员审批任务列表，含设备清单展开、模态框审批 |

### 4.2 关键交互

- **加入清单**：设备列表/详情页上的"加入借用清单"按钮，调用 `Api.addToCart()`
- **清单上限**：受系统配置 `borrow_order_max_items` 控制，默认 20
- **必填校验**：用途（textarea）和照片（file input）均为前端必填
- **照片上传**：借用单创建成功后，循环调用 `Api.uploadAttachment()` 上传每张照片
- **审批模态框**：`_showApprovalModal()` 共享函数，支持必填/选填意见
- **交付确认**：管理员在详情页点击"确认交付"按钮

---

## 5. 自动化测试

| 测试文件 | 覆盖内容 |
|----------|----------|
| `backend/tests/test_borrow_flow.py` | 借用单创建、审批拆分逻辑 |
| `backend/tests/test_borrow_e2e.py` | 端到端：创建→审批→交付完整流程 |

---

## 6. 接班说明

- 审批拆分逻辑在 `borrow_service.py` 的 `create_borrow_order()` 中，按 `admin_id` 分组生成任务
- 审批状态聚合判断在 `borrow_approval_service.py` 中，每次审批后检查是否全部完成
- 借用清单使用 localStorage，不经过后端，刷新页面不丢失
- `_showApprovalModal()` 是借出和归还审批共用的模态框函数，定义在 `borrow.js` 底部
- 快照字段确保历史订单不受主数据修改影响

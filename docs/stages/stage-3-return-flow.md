# 阶段三：归还流程

> **状态：✅ 已完成**
> **对应规格书：§19.2 第三阶段、§7.3 归还流程、§7.4 部分归还、§7.5 丢失处理**

---

## 1. 阶段目标

实现设备归还业务闭环：用户从已交付的借用单中选择归还设备 → 逐件填写归还状态并上传照片 → 提交归还单 → 管理员按设备归属自动拆分审批 → 审批通过后设备状态恢复/变更。

---

## 2. 范围清单

| 功能项 | 状态 | 说明 |
|--------|------|------|
| 归还单创建 | ✅ | 从借用单选择归还设备，逐件填写状态 |
| 整单归还 | ✅ | 勾选全部设备一次性归还 |
| 部分归还 | ✅ | 只勾选部分设备，借用单状态→PARTIALLY_RETURNED |
| 逐件归还照片 | ✅ | 每件设备必须单独上传照片（前端必填验证） |
| 归还状态选择 | ✅ | GOOD / DAMAGED / PARTIAL_LOSS / FULL_LOSS |
| 损坏类型细分 | ✅ | SHELL_BROKEN / FUNCTION_ERROR / ACCESSORY_DAMAGED / BOOT_BUT_NOT_WORKING / OTHER |
| 审批任务自动拆分 | ✅ | 按设备所属管理员自动生成归还审批任务 |
| 管理员审批通过/驳回 | ✅ | 模态框审批，带意见 |
| 超管兜底审批 | ✅ | 超管可审批任意归还任务 |
| 丢失处理 | ✅ | 归还状态为 FULL_LOSS 时设备状态→LOST |
| 损坏处理 | ✅ | 归还状态为 DAMAGED 时设备状态→DAMAGED |
| 归还单列表 | ✅ | 支持状态筛选 |
| 归还单详情 | ✅ | 明细表格含照片缩略图、审批进度 |
| 归还审批任务列表 | ✅ | 管理员专用，含每件设备状态+照片展示 |

---

## 3. 后端实现

### 3.1 数据模型

| 模型文件 | 说明 |
|----------|------|
| `backend/app/models/return_order.py` | 归还单：order_no, borrow_order_id, applicant_id, status, remark |
| `backend/app/models/return_order_item.py` | 归还明细：order_id, asset_id, condition, damage_type, damage_description, 快照字段 |
| `backend/app/models/return_approval_task.py` | 归还审批任务：return_order_id, approver_id, item_ids(JSON), status, comment, decided_at |

### 3.2 业务服务

| 服务文件 | 关键方法 | 说明 |
|----------|----------|------|
| `backend/app/services/return_service.py` | `create_return_order()` | 创建归还单 + 明细 + 审批任务拆分，设备状态→PENDING_RETURN_APPROVAL |
| `backend/app/services/return_approval_service.py` | `approve_task()` | 通过归还审批，根据归还状态恢复/变更设备状态 |
| | `reject_task()` | 驳回归还审批 |

### 3.3 API 路由

| 路由文件 | 前缀 | 关键端点 |
|----------|------|----------|
| `backend/app/api/return_orders.py` | `/return-orders` | POST 创建、GET 列表、GET 详情 |
| `backend/app/api/return_approvals.py` | `/return-approval-tasks` | GET 列表、POST approve、POST reject |

### 3.4 状态流转

```
归还单：
创建 → PENDING_APPROVAL
       ├→ 部分审批通过 → PARTIALLY_APPROVED
       ├→ 全部通过 → APPROVED → COMPLETED
       └→ 驳回 → REJECTED

设备状态（审批通过后）：
  GOOD       → IN_STOCK
  DAMAGED    → DAMAGED
  FULL_LOSS  → LOST
  PARTIAL_LOSS → DAMAGED（按损坏处理）

借用单状态联动：
  部分设备归还 → PARTIALLY_RETURNED
  全部设备归还 → COMPLETED
```

---

## 4. 前端实现

### 4.1 页面路由

| 路由名 | 文件 | 说明 |
|--------|------|------|
| `return-submit` | `frontend/js/return.js` | 归还单创建页：从借用单加载未归还设备，逐件勾选、填写状态、上传照片 |
| `my-returns` | `frontend/js/return.js` | 我的归还单列表 |
| `return-detail` | `frontend/js/return.js` | 归还单详情：明细表格（含照片缩略图点击 lightbox）、审批进度、行内审批 |
| `return-approvals` | `frontend/js/return.js` | 管理员归还审批任务列表：每件设备状态+照片+审批按钮 |

### 4.2 关键交互

- **入口**：借用单详情页的"归还设备"按钮，跳转到 `return-submit?borrow_order_id=xxx`
- **逐件操作**：每件设备独立勾选、选择归还状态、上传照片
- **必填校验**：每件勾选的设备必须上传至少一张照片（前端拦截）
- **照片上传**：归还单创建成功后，按 item 循环上传照片至 `ReturnOrderItem` 关联
- **审批列表**：展示每件设备的归还状态芯片 + 照片缩略图 + 损坏描述

---

## 5. 自动化测试

| 测试文件 | 覆盖内容 |
|----------|----------|
| `backend/tests/test_return_e2e.py` | 端到端：借用→交付→归还→审批完整流程 |

---

## 6. 接班说明

- 归还审批通过后的设备状态恢复逻辑在 `return_approval_service.py` 中集中实现
- 部分归还的借用单状态联动在归还审批通过后自动判断
- 损坏类型枚举定义在 `backend/app/utils/enums.py` 的 `DamageType`
- 归还照片按 `ReturnOrderItem` 关联，photo_type 为 `RETURN_ITEM`
- 照片在归还审批任务列表中通过 `item_details` 聚合返回（含 photos 数组）
- 前端 lightbox 查看照片功能通过 `Utils.openLightbox()` 统一实现

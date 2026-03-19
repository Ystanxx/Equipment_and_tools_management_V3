# 04. API Specification

## 1. General conventions
- Base path: `/api`
- Data format: JSON
- Upload content type: `multipart/form-data`
- Time format: ISO 8601 or `YYYY-MM-DD HH:mm:ss`
- All status fields must use fixed enum values
- Auth mechanism for V1: session cookie **or** bearer token; choose one and stay consistent

## 2. Common response format
### Success
```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

### Error
```json
{
  "code": 40001,
  "message": "tool is not available",
  "data": null
}
```

## 3. Authentication
### POST `/api/auth/login`
Login with username and password.

Request:
```json
{
  "username": "alice",
  "password": "secret"
}
```

Response:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "user": {
      "id": 1,
      "username": "alice",
      "role_type": "user"
    },
    "token": "optional-if-using-token-auth"
  }
}
```

### POST `/api/auth/logout`
Logout current session.

### GET `/api/auth/me`
Return current user profile and permissions.

## 4. User and permission management
### GET `/api/users`
Query users.
Filters:
- `keyword`
- `role_type`
- `is_active`

### POST `/api/users`
Create user.

Request:
```json
{
  "username": "user1",
  "password": "initial_password",
  "role_type": "user",
  "is_active": true
}
```

### PUT `/api/users/{id}`
Update basic user info.

### PUT `/api/users/{id}/status`
Enable or disable account.

### GET `/api/admins/{id}/permissions`
Get admin permission list.

### PUT `/api/admins/{id}/permissions`
Replace admin permission list.

Request:
```json
{
  "permissions": [
    "tool.view",
    "tool.create",
    "tool.edit",
    "borrow.view",
    "return.review"
  ]
}
```

## 5. Tool management
### GET `/api/tools`
Query tool list.

Filters:
- `keyword`
- `status`
- `category_id`

Response item example:
```json
{
  "id": 11,
  "code": "T003",
  "name": "Digital Multimeter 2",
  "category_id": 2,
  "current_status": "IN_STOCK"
}
```

### GET `/api/tools/{id}`
Get one tool with recent records.

### POST `/api/tools`
Create tool.

### PUT `/api/tools/{id}`
Update tool.

### DELETE `/api/tools/{id}`
Soft delete or hard delete according to implementation choice. Prefer soft delete only if you truly need it; otherwise keep V1 simple.

### PUT `/api/tools/{id}/status`
Manual status adjustment by authorized admin/super admin.

## 6. Borrow
### POST `/api/borrow-orders`
Create borrow order.

Recommended form:
- JSON body for tool list and remark
- multipart form if borrowing photos are uploaded in same request

Suggested multipart fields:
- `payload`: JSON string
- `photos`: one or more image files

Payload example:
```json
{
  "tool_ids": [11, 12],
  "remark": "lab use"
}
```

Behavior:
- lock target tools
- ensure all are `IN_STOCK`
- create borrow order and items
- process/store photos
- update statuses to `BORROWED`
- write audit logs

Success response:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "borrow_order_id": 101,
    "order_no": "BOR-20260317-0001"
  }
}
```

### GET `/api/borrow-orders/my`
Get current user's borrow orders.

### GET `/api/borrow-orders/{id}`
Get borrow order detail including items and photos.

## 7. Return
### POST `/api/return-orders`
Submit return request.

Suggested multipart form:
- `payload`: JSON string
- `photos`: one or more image files

Payload example:
```json
{
  "borrow_order_id": 101,
  "items": [
    {
      "tool_id": 11,
      "user_report_status": "IN_STOCK",
      "issue_description": ""
    },
    {
      "tool_id": 12,
      "user_report_status": "DAMAGED",
      "issue_description": "screen cracked"
    }
  ]
}
```

Behavior:
- validate borrow order ownership unless admin use-case says otherwise
- ensure order still has unreturned items
- create return order
- store return photos
- keep tool status as `BORROWED`
- set return review status to `PENDING`

### GET `/api/return-orders/pending`
Admin list of pending return reviews.

### GET `/api/return-orders/{id}`
Get full return detail including:
- borrow info
- return info
- borrow photos
- return photos
- item list
- issue descriptions

### POST `/api/return-orders/{id}/review`
Admin review return order.

Request:
```json
{
  "review_status": "APPROVED",
  "review_remark": "checked",
  "items": [
    {
      "tool_id": 11,
      "final_status": "IN_STOCK"
    },
    {
      "tool_id": 12,
      "final_status": "DAMAGED"
    }
  ]
}
```

Behavior:
- verify reviewer permission
- update return order review info
- update tool final statuses
- mark corresponding borrow items returned
- run retention cleanup for affected tools
- write audit logs

## 8. Audit logs
### GET `/api/audit-logs`
Query logs.

Filters:
- `user_id`
- `action_type`
- `target_type`
- `target_id`
- `date_from`
- `date_to`

## 9. Suggested error codes
- `40001` tool not available
- `40002` invalid status transition
- `40003` permission denied
- `40004` invalid borrow order
- `40005` return order already reviewed
- `40006` invalid upload file
- `40007` account disabled
- `50001` unexpected server error

## 10. Implementation notes for FastAPI
FastAPI can expose automatic OpenAPI docs, which makes it suitable for frontend/backend contract review during development. citeturn120381search17turn120381search4
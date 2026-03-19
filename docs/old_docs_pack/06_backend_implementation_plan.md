# 06. Backend Implementation Plan

## 1. Recommended project structure

```text
app/
  api/
    auth.py
    users.py
    tools.py
    borrow_orders.py
    return_orders.py
    audit_logs.py
  core/
    config.py
    security.py
    database.py
    permissions.py
  models/
    user.py
    tool.py
    borrow_order.py
    return_order.py
    photo.py
    audit_log.py
  schemas/
    auth.py
    user.py
    tool.py
    borrow_order.py
    return_order.py
    common.py
  services/
    auth_service.py
    tool_service.py
    borrow_service.py
    return_service.py
    photo_service.py
    retention_service.py
    audit_service.py
  utils/
    image_utils.py
    order_no.py
    time_utils.py
  main.py
```

## 2. Implementation order
### Phase 1
- project skeleton
- config management
- database connection
- user model and auth
- role/permission checks

### Phase 2
- tool CRUD
- tool list/search
- status enum constants

### Phase 3
- borrow order creation
- concurrency-safe borrow transaction
- borrow order query APIs

### Phase 4
- return order creation
- return review API
- final status updates
- mark items returned

### Phase 5
- image processing
- watermarking
- local storage
- retention cleanup

### Phase 6
- audit logs
- basic tests
- deployment scripts

## 3. Authentication
Choose one:
- session-based auth
- JWT bearer token auth

For a simple internal system, either can work. The key is to keep it consistent.

## 4. Password handling
- never store plaintext passwords
- use a standard password hash library
- enforce password reset path later if needed

## 5. Permission strategy
- `super_admin` bypasses normal permission checks
- `admin` must hold explicit permission code
- `user` has only self-service endpoints

## 6. Borrow transaction logic
Pseudo-flow:

```python
begin transaction
for each tool_id:
    select tool for update
    ensure current_status == "IN_STOCK"
create borrow_order
create borrow_order_items
process photos
update tools current_status = "BORROWED"
write audit log
commit
```

PostgreSQL documents explicit locking as a way to control concurrent access when default MVCC behavior is not enough for the application. citeturn120381search2turn120381search6

## 7. Return review logic
Pseudo-flow:

```python
begin transaction
load return_order
ensure review_status == "PENDING"
validate reviewer permissions
for each returned item:
    set final status
    update tool current_status
    mark borrow_order_item returned_flag = true
update return_order review fields
run retention cleanup for affected tools
write audit logs
commit
```

## 8. Image processing requirements
### Input validation
- allow jpeg/png/webp if desired
- reject suspicious or oversized files
- normalize output to jpeg unless there is a strong reason otherwise

### Processing
- open image
- resize to max edge target
- compress
- draw watermark text
- save processed image
- return metadata

Pillow provides image drawing primitives suitable for watermark text rendering on processed images. citeturn120381search3

## 9. Retention cleanup algorithm
Per reviewed tool:
1. query completed cycles for tool
2. sort by review_time descending
3. keep latest 3
4. delete older photo files if they exist
5. delete corresponding photo rows
6. insert log entry

## 10. Logging requirements
Every critical endpoint should call a shared audit logger.

## 11. Suggested libraries
- fastapi
- uvicorn
- sqlalchemy
- psycopg2-binary or asyncpg
- pillow
- python-multipart
- pydantic

## 12. Testing priorities
- duplicate borrow prevention
- return review status transitions
- permission enforcement
- photo upload validation
- retention cleanup behavior
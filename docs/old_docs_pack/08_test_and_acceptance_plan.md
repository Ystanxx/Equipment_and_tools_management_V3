# 08. Test and Acceptance Plan

## 1. Test scope
- authentication
- permissions
- tool CRUD
- borrow flow
- return flow
- return review
- image processing
- retention cleanup
- audit logs

## 2. Core acceptance cases

## 2.1 Login
### Case
Valid user logs in successfully.

### Expected
- login succeeds
- current user info returned
- disabled users cannot log in

## 2.2 Tool creation
### Case
Admin creates a tool.

### Expected
- tool code is unique
- new tool status defaults to `IN_STOCK`

## 2.3 Borrow success
### Case
User borrows one `IN_STOCK` tool.

### Expected
- borrow order created
- borrow order item created
- image stored
- tool status becomes `BORROWED`
- audit log written

## 2.4 Borrow conflict
### Case
Two requests try to borrow the same tool nearly simultaneously.

### Expected
- only one succeeds
- the other fails with availability error

## 2.5 Return submission
### Case
User submits return for borrowed tool.

### Expected
- return order created
- review status = `PENDING`
- return photos stored
- tool status remains `BORROWED`

## 2.6 Return review normal
### Case
Admin reviews return as normal.

### Expected
- review status becomes `APPROVED`
- tool status becomes `IN_STOCK`
- borrow item marked returned
- audit logs written

## 2.7 Return review abnormal
### Case
Admin sets final status `DAMAGED`.

### Expected
- tool status becomes `DAMAGED`
- status remains unavailable for borrow unless admin changes it later

## 2.8 Permission enforcement
### Case
Normal user tries to access admin endpoint.

### Expected
- request denied

## 2.9 Watermark presence
### Case
Borrow/return images are processed.

### Expected
- stored image contains watermark text
- image dimensions are reduced according to config

## 2.10 Retention cleanup
### Case
Tool accumulates 4+ completed cycles.

### Expected
- only latest 3 complete cycles remain
- pending review cycles are untouched
- older files are deleted
- deletion audit log exists

## 3. Manual QA checklist
- page navigation works
- mobile borrow/return pages are usable
- admin review photo comparison is readable
- error messages are understandable
- image upload failure is handled gracefully

## 4. Exit criteria
V1 is acceptable when:
- all core acceptance cases pass
- no duplicate borrow issue remains
- image retention works reliably
- admin review correctly determines final statuses
- logs exist for all critical actions
# 09. Codex Execution Prompt

Use the following instruction set as the starting prompt for Codex.

---

You are implementing **V1 of an internal tool/device management system** for a small research group.

## Mission
Build a minimum runnable version with:
- native Linux deployment
- FastAPI backend
- PostgreSQL database
- local filesystem image storage
- HTML/CSS/JavaScript frontend (Bootstrap is acceptable)
- no Docker
- no OSS
- no QR codes
- no borrow review
- return review required

## Business rules
### Roles
- super_admin
- admin
- user

### Statuses
Use exactly these tool statuses:
- IN_STOCK
- BORROWED
- DAMAGED
- PARTIALLY_LOST
- LOST
- SCRAPPED

### Borrow
- only IN_STOCK tools can be borrowed
- borrow does not need admin review
- borrow must upload at least one photo
- borrow changes tool status to BORROWED immediately
- prevent duplicate borrowing under concurrency

### Return
- user submits return request for borrowed tools
- user uploads return photos
- user may provide abnormal note
- return remains pending until reviewed by admin
- admin sets final status: IN_STOCK / DAMAGED / PARTIALLY_LOST / LOST / SCRAPPED

### Photos
- backend must standardize images
- backend must compress images
- backend must add watermark text containing:
  - timestamp
  - username
  - order number
  - tool code
- store processed images on local filesystem
- save only file metadata in DB

### Retention rule
For each tool, keep only the latest 3 complete borrow-return cycles of photos.
Do not delete photos for cycles whose return is still pending review.

## Technical implementation requirements
- use FastAPI
- use PostgreSQL
- use SQLAlchemy or SQLModel
- use Pillow for image processing
- use Uvicorn for serving the ASGI app
- structure code into routers, services, models, schemas
- include audit logging for all critical actions
- build the project in a way that frontend and backend can be developed separately

## Deliverables
1. backend project skeleton
2. database models and migration/init scripts
3. REST APIs for auth, users, permissions, tools, borrow, return, review, audit logs
4. image processing service
5. retention cleanup service
6. simple frontend pages:
   - login
   - tool list
   - borrow
   - my borrow records
   - return
   - admin dashboard
   - tool management
   - return review
   - user management
   - audit logs
7. deployment files:
   - requirements.txt
   - .env.example
   - systemd service example
   - nginx example
   - README.md with startup steps

## Code quality rules
- keep implementation simple
- prefer readability over cleverness
- avoid premature abstraction
- do not add features outside the spec
- centralize status transition rules in service layer
- validate permissions in backend, not only frontend
- return consistent JSON response structure
- include comments where business rules are non-obvious

## First implementation order
1. project scaffold
2. auth + users
3. tools
4. borrow flow
5. return flow
6. review flow
7. image service
8. retention cleanup
9. audit logs
10. basic frontend integration

Use the accompanying documents in this handoff package as the source of truth.

---

## Suggested first task for Codex
“Create the project skeleton and implement the database schema, auth module, tool CRUD APIs, and borrow flow first. Use placeholder frontend pages if needed, but keep API contracts stable.”
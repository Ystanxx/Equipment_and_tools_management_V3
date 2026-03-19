# 01. Product Requirements Document (PRD)

## 1. Project goal
Build a lightweight internal management system for tools and devices used by a research group. The system should support borrowing, returning, photo evidence retention, return review by admins, and clear device status tracking.

## 2. Scope
### In scope for V1
- User login
- Role-based access control
- Tool/device master data management
- Borrow without review
- Return submission with admin review
- Upload borrow/return photos
- Automatic image compression and watermarking
- Local server file storage
- Keep only the latest 3 complete borrow-return photo cycles per device
- Operation audit logs

### Out of scope for V1
- QR codes / barcode scanning
- OSS / object storage
- Docker
- Borrow review
- Reservation / scheduling
- Overdue reminders
- SMS / push messaging
- Multi-server deployment
- Complex warehouse/location logic
- Advanced analytics dashboard

## 3. User roles
### 3.1 Super admin
Full permissions:
- Manage users
- Manage admin permissions
- Manage tools/devices
- Review returns
- Change device status
- View all logs

### 3.2 Admin
Permissions assigned by super admin. May include:
- Create/edit/delete tools
- View borrow/return records
- Review returns
- Update statuses
- View logs

### 3.3 Normal user
- Login
- View tool list
- Borrow available tools
- Submit returns
- Upload photos
- Fill abnormal return notes
- View own records

## 4. Device statuses
The system only uses these statuses:
- `IN_STOCK` (在库)
- `BORROWED` (借出)
- `DAMAGED` (损坏)
- `PARTIALLY_LOST` (部分丢失)
- `LOST` (丢失)
- `SCRAPPED` (报废)

## 5. Business rules
### 5.1 Borrow
- Only tools in `IN_STOCK` can be borrowed
- Borrow does not require review
- Borrow action immediately changes status to `BORROWED`
- Borrow must record at least one photo
- System must prevent the same tool from being borrowed twice concurrently

### 5.2 Return
- Return is always linked to an existing borrow record
- User submits return photos and optional abnormal note
- Tool remains `BORROWED` until admin review completes
- Admin sets final device status after review
- Final status may be: `IN_STOCK`, `DAMAGED`, `PARTIALLY_LOST`, `LOST`, `SCRAPPED`

### 5.3 Photo rules
Each business photo should carry watermark information:
- Timestamp
- Username
- Order number
- Tool code

Images must be:
- compressed
- standardized by backend
- stored locally on server
- associated with borrow/return records

### 5.4 Photo retention policy
For each tool, only keep the most recent **3 complete borrow-return cycles** of photos.
- A complete cycle = borrow photos + reviewed return photos
- Cycles still pending review must never be deleted
- Older cycles beyond the most recent 3 can be deleted automatically

## 6. Non-functional requirements
- Simple to deploy
- Low maintenance overhead
- Works on a single Linux server
- Basic security hygiene
- Easy handoff to Codex and future developers

## 7. Success criteria
The system is successful if:
- users can borrow tools without admin review
- users can submit returns with photos
- admins can review returns and set final status
- all critical operations are logged
- photo storage remains bounded by the retention rule
# 03. Database Design

## 1. Design principles
- Keep schema simple
- Use normalized tables for core entities
- Store file paths, not file binaries
- Track business orders and review records explicitly
- Keep status values fixed and enumerated

## 2. Entity list
- users
- admin_permissions
- tool_categories
- tools
- borrow_orders
- borrow_order_items
- return_orders
- return_order_items
- photos
- audit_logs

## 3. Table definitions

## 3.1 users
Purpose: store user accounts.

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| username | varchar(64) unique | login name |
| password_hash | varchar(255) | hashed password only |
| role_type | varchar(20) | `super_admin`, `admin`, `user` |
| is_active | boolean | default true |
| created_at | timestamptz | |
| updated_at | timestamptz | |

## 3.2 admin_permissions
Purpose: permission points for admin accounts.

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| user_id | bigint FK users(id) | admin user |
| permission_code | varchar(64) | e.g. `tool.edit` |
| created_at | timestamptz | |

Unique constraint:
- `(user_id, permission_code)`

## 3.3 tool_categories
| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| name | varchar(128) unique | |
| description | text | |
| created_at | timestamptz | |

## 3.4 tools
Purpose: each physical device/tool is a single row.

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| code | varchar(64) unique | human-visible unique code |
| name | varchar(128) | |
| category_id | bigint FK tool_categories(id) | nullable |
| description | text | |
| current_status | varchar(20) | enum-like fixed values |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Allowed `current_status` values:
- `IN_STOCK`
- `BORROWED`
- `DAMAGED`
- `PARTIALLY_LOST`
- `LOST`
- `SCRAPPED`

## 3.5 borrow_orders
Purpose: borrow order header.

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| order_no | varchar(64) unique | e.g. `BOR-20260317-0001` |
| user_id | bigint FK users(id) | borrower |
| remark | text | optional |
| created_at | timestamptz | |

## 3.6 borrow_order_items
Purpose: borrowed tools under one borrow order.

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| borrow_order_id | bigint FK borrow_orders(id) | |
| tool_id | bigint FK tools(id) | |
| borrow_status_snapshot | varchar(20) | expected `IN_STOCK` |
| returned_flag | boolean | default false |
| created_at | timestamptz | |

Unique constraint:
- `(borrow_order_id, tool_id)`

## 3.7 return_orders
Purpose: return submission header.

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| return_no | varchar(64) unique | e.g. `RET-20260318-0001` |
| borrow_order_id | bigint FK borrow_orders(id) | |
| user_id | bigint FK users(id) | submitter |
| review_status | varchar(20) | `PENDING`, `APPROVED`, `REJECTED` |
| review_admin_id | bigint FK users(id) | nullable |
| review_time | timestamptz | nullable |
| review_remark | text | nullable |
| created_at | timestamptz | |

## 3.8 return_order_items
Purpose: per-tool return details.

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| return_order_id | bigint FK return_orders(id) | |
| tool_id | bigint FK tools(id) | |
| user_report_status | varchar(20) | user-declared status |
| final_status | varchar(20) | admin confirmed status, nullable before review |
| issue_description | text | nullable |
| created_at | timestamptz | |

## 3.9 photos
Purpose: processed image metadata.

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| tool_id | bigint FK tools(id) | |
| related_type | varchar(20) | `BORROW`, `RETURN` |
| related_order_id | bigint | borrow order id or return order id |
| file_path | text | local filesystem path |
| file_name | varchar(255) | stored filename |
| image_type | varchar(50) | e.g. `main`, `detail` |
| watermark_text | text | stored rendered watermark text |
| created_by | bigint FK users(id) | |
| created_at | timestamptz | |

Recommended indexes:
- `(tool_id, created_at desc)`
- `(related_type, related_order_id)`

## 3.10 audit_logs
Purpose: track critical operations.

| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| user_id | bigint FK users(id) | actor |
| action_type | varchar(64) | e.g. `BORROW_CREATE` |
| target_type | varchar(32) | e.g. `tool`, `borrow_order` |
| target_id | bigint | |
| detail | jsonb | structured details |
| created_at | timestamptz | |

JSON/JSONB is supported natively in PostgreSQL and is suitable for flexible log detail payloads. citeturn120381search14

## 4. Suggested enum constants
### role_type
- `super_admin`
- `admin`
- `user`

### review_status
- `PENDING`
- `APPROVED`
- `REJECTED`

### action_type examples
- `LOGIN`
- `USER_CREATE`
- `ADMIN_PERMISSION_UPDATE`
- `TOOL_CREATE`
- `TOOL_UPDATE`
- `TOOL_DELETE`
- `BORROW_CREATE`
- `RETURN_SUBMIT`
- `RETURN_REVIEW`
- `TOOL_STATUS_UPDATE`
- `PHOTO_DELETE_BY_RETENTION`

## 5. Sample PostgreSQL DDL skeleton

```sql
create table users (
    id bigserial primary key,
    username varchar(64) not null unique,
    password_hash varchar(255) not null,
    role_type varchar(20) not null check (role_type in ('super_admin','admin','user')),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table tool_categories (
    id bigserial primary key,
    name varchar(128) not null unique,
    description text,
    created_at timestamptz not null default now()
);

create table tools (
    id bigserial primary key,
    code varchar(64) not null unique,
    name varchar(128) not null,
    category_id bigint references tool_categories(id),
    description text,
    current_status varchar(20) not null check (
        current_status in ('IN_STOCK','BORROWED','DAMAGED','PARTIALLY_LOST','LOST','SCRAPPED')
    ),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
```

## 6. Retention cleanup model
For each tool:
1. identify completed borrow-return cycles
2. sort by review completion time descending
3. keep top 3 cycles
4. delete photos for older cycles
5. insert audit log rows for deletions

Do not delete:
- any cycle whose return is still pending review
- any cycle with missing relational integrity
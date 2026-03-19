# 02. System Architecture

## 1. Architecture summary
Use a **single-server architecture** for V1.

### Components on one Linux server
- Nginx
- FastAPI app
- Uvicorn ASGI server
- PostgreSQL
- Local filesystem for photo storage

This is suitable for the project's low scale and low operation frequency.

## 2. Recommended runtime layout

```text
Internet / LAN
      |
    Nginx
      |
  FastAPI + Uvicorn
      |
  PostgreSQL
      |
 Local file storage (/data/uploads)
```

## 3. Why this architecture
- Minimal cost
- Minimal maintenance
- No object storage dependency
- No container runtime dependency
- Sufficient for <1000 devices and low concurrency

FastAPI can be run directly with an ASGI server such as Uvicorn, and manual deployment is a supported deployment path. citeturn120381search0turn120381search15

## 4. Deployment style
### V1
- Native Linux deployment
- Python virtual environment
- Nginx reverse proxy
- systemd to supervise the backend service
- PostgreSQL installed on same machine
- Photo files stored on local filesystem

### Not used in V1
- Docker
- Kubernetes
- OSS
- CDN
- Multi-node load balancing

## 5. Suggested filesystem layout

```text
/opt/tool-system/
  app/
  venv/
  logs/
  scripts/

/data/tool-system/
  uploads/
    borrow/
    return/
  backups/
  postgres/
```

## 6. Image processing flow
1. User uploads image
2. Frontend may perform lightweight pre-compression
3. Backend validates file type and size
4. Backend compresses again
5. Backend adds watermark
6. Backend stores the processed image
7. Backend writes metadata to database
8. Backend applies retention cleanup for the specific tool if eligible

Pillow's ImageDraw module can be used to annotate images and generate watermark overlays during backend processing. citeturn120381search3

## 7. Concurrency control
Even though borrow frequency is low, the system must prevent duplicate borrowing of the same tool.

Recommended approach:
- Start transaction
- Lock target tool row
- Recheck status
- Create borrow order
- Update tool status to `BORROWED`
- Commit

PostgreSQL supports explicit locking and row-locking clauses such as `SELECT ... FOR UPDATE` for application-controlled concurrency control. citeturn120381search2turn120381search20

## 8. Open collaboration model
Frontend and backend can be developed independently.

### Frontend responsibilities
- page structure
- interactions
- client validation
- preview selected images
- optional pre-compression
- API integration

### Backend responsibilities
- auth
- authorization
- business rules
- image processing
- file storage
- DB access
- logs
- cleanup jobs

## 9. Risks and mitigations
### Risk: single point of failure
Mitigation:
- daily DB backup
- daily upload directory backup
- simple restore guide

### Risk: disk fills up
Mitigation:
- enforce compression
- enforce retention
- monitor disk usage
- reject oversized uploads

### Risk: inconsistent status transitions
Mitigation:
- centralize business rules in backend service layer
- avoid direct status edits outside reviewed flows
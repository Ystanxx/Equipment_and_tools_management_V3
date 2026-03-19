# Tool/Device Management System — Codex Delivery Pack

This folder contains the full handoff package for implementing **V1 (minimum runnable version)** of the internal tool/device management system.

## Recommended reading order
1. `01_product_requirements_document.md`
2. `02_system_architecture.md`
3. `03_database_design.md`
4. `04_api_specification.md`
5. `05_frontend_specification.md`
6. `06_backend_implementation_plan.md`
7. `07_deployment_and_operations.md`
8. `08_test_and_acceptance_plan.md`
9. `09_codex_execution_prompt.md`

## Project positioning
- Internal system for a research group / lab
- Fewer than 1000 tools/devices
- Low borrow/return frequency
- Single-server deployment
- Native Linux deployment (no Docker in V1)
- Local photo storage on server filesystem
- Keep only the most recent **3 complete borrow-return cycles** of photos per device
- Borrow does **not** require admin review
- Return **does** require admin review

## Core technical stack
- Frontend: HTML + CSS + JavaScript + Bootstrap
- Backend: Python + FastAPI + Uvicorn
- Database: PostgreSQL
- Image processing: Pillow
- Reverse proxy: Nginx

## Important constraints
- No QR codes in V1
- No OSS in V1
- No overdue reminders in V1
- No borrow scheduling/reservations in V1
- All key operations must be logged
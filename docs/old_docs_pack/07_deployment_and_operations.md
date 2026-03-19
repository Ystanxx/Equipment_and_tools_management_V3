# 07. Deployment and Operations

## 1. Deployment target
Single Linux cloud server.

## 2. Native deployment choice
V1 does not require Docker. Native deployment is acceptable for this small internal system.

FastAPI supports manual deployment with an ASGI server such as Uvicorn. citeturn120381search0

## 3. Recommended services on server
- Nginx
- Python 3.11+
- PostgreSQL
- systemd
- virtualenv or venv

## 4. Suggested deployment steps
1. create Linux user for app
2. install Python/PostgreSQL/Nginx
3. create project directories
4. create Python virtual environment
5. install requirements
6. configure environment variables
7. initialize database
8. start FastAPI via systemd
9. configure Nginx reverse proxy
10. test upload and borrow/return flows

## 5. Uvicorn runtime notes
For development, `--reload` is useful. For production, do not use auto-reload. Uvicorn documents `--reload` as an optional auto-reload behavior and it is off by default. citeturn120381search1

Recommended V1 production command example:
```bash
/opt/tool-system/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

If later needed, workers can be added, but V1 does not require aggressive scaling. FastAPI also documents worker-based deployment options for multi-process setups. citeturn120381search21

## 6. systemd service example
```ini
[Unit]
Description=Tool System API
After=network.target postgresql.service

[Service]
User=toolapp
Group=toolapp
WorkingDirectory=/opt/tool-system/app
Environment="PATH=/opt/tool-system/venv/bin"
ExecStart=/opt/tool-system/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 7. Nginx reverse proxy example
```nginx
server {
    listen 80;
    server_name your-domain-or-ip;

    client_max_body_size 20M;

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        root /opt/tool-system/frontend;
        try_files $uri $uri/ /index.html;
    }
}
```

## 8. Backup strategy
At minimum:
- daily PostgreSQL dump
- daily backup of upload directory
- retain several historical backups
- test restore once

## 9. Monitoring checklist
- disk usage
- PostgreSQL service status
- API process status
- Nginx status
- upload directory growth
- failed login rate

## 10. Security checklist
- close unused ports
- run API behind Nginx
- enable HTTPS if exposed beyond trusted LAN
- use strong admin passwords
- avoid running app as root

FastAPI's deployment concepts emphasize practical concerns such as HTTPS, restarts, running on startup, memory, and process management. citeturn120381search15

## 11. Restore checklist
Document:
- how to restore DB dump
- how to restore uploads
- how to restart services
- how to verify integrity after restore
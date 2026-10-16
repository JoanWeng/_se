# Docker 微服務系統

## 架構

```
Browser
  └─ nginx:80 (Web Server + Reverse Proxy, 同時 serve 本展示頁)
       ├─ /api/node/   → api-node:3000   (Node.js 20 + Express)
       ├─ /api/python/ → api-python:5000 (Python 3.11 + Flask)
       └─ /api/rust/   → api-rust:8000   (Rust + Axum)
              ↘ 共用 db:5432 (PostgreSQL 16) ↙
```

## 繳交內容

| 檔案 | 說明 |
|---|---|
| `docker-compose.yml` | 編排 5 個容器：nginx / db / api-node / api-python / api-rust |
| `nginx/Dockerfile` | nginx web server + reverse proxy |
| `backend-node/Dockerfile` | Node.js 執行環境 |
| `backend-python/Dockerfile` | Python 執行環境 |
| `backend-rust/Dockerfile` | Rust 執行環境 (multi-stage build，基底用最新穩定版 `rust:bookworm`) |
| `frontend/index.html` | 簡易 web 介面展示系統狀態 |

## 執行

```bash
cd _se/05/docker-microsystem
docker compose up --build
# 開啟 http://localhost:8080
```

## 驗證

- `http://localhost:8080` → 展示頁
- `http://localhost:8080/api/node/health`
- `http://localhost:8080/api/python/health`
- `http://localhost:8080/api/rust/health`
- `http://localhost:8080/nginx-status` → nginx 狀態

## 停止

```bash
docker compose down
docker compose down -v   # 連資料庫 volume 一起清掉
```

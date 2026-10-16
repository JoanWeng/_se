# 05 — Docker 微服務系統

以 Docker Compose 編排的微服務展示系統：nginx 反向代理＋靜態展示頁，三個後端（Node.js / Python / Rust）共用 PostgreSQL。

## 一、需要安裝的套件

| 套件 | 用途 | 檢查 |
|---|---|---|
| Docker Engine（含 Compose v2） | 建置、執行容器 | `docker --version`、`docker compose version` |
| Git | 下載本專案 | `git --version` |

> 本專案只需 Docker＋Git。Node.js / Python / Rust / PostgreSQL / nginx **都不用裝在本機**，全部跑在容器裡。

## 二、如何建置與執行

```bash
# 1. 下載
git clone https://github.com/JoanWeng/_se.git
cd _se/05/docker-microsystem

# 2. 建置並啟動（首次約 20–40 分鐘，Rust 編譯最久）
sudo docker compose up --build -d

# 3. 確認 5 個容器都在跑
sudo docker compose ps
```

> 這台機器一般帳號沒有 docker 權限，指令需加 `sudo`。

## 三、使用方法

- 展示頁：瀏覽器開 `http://localhost:8080`（同區網他機改用主機 IP，如 `http://192.168.92.128:8080`）
- 健康檢查：`/api/node/health`、`/api/python/health`、`/api/rust/health`
- 讀寫 DB 驗證：`/api/<svc>/api/users`（寫一筆再讀最新 5 筆）
- nginx 狀態：`/nginx-status`

```bash
# 看 log（有問題時）
sudo docker compose logs --tail=30 <服務名>   # 如 nginx、api-rust

# 停止（保留 DB 資料）/ 全清（含 DB）
sudo docker compose down
sudo docker compose down -v
```

## 四、專案架構

```
Browser ── :8080 ──▶ nginx:80（serve 展示頁＋反向代理）
  ├─ /             → 靜態前端 frontend/index.html
  ├─ /api/node/    → api-node:3000   （Node.js 20 + Express + pg）
  ├─ /api/python/  → api-python:5000  （Python 3.11 + Flask + psycopg2）
  └─ /api/rust/    → api-rust:8000    （Rust + Axum + tokio-postgres，multi-stage）
        └─ 三後端共用 → db:5432（PostgreSQL 16，visits 表，pgdata volume 持久化）
```

```
05/
  專案架構.md              # 規劃書
  README.md                # 本檔
  docker-microsystem/
    docker-compose.yml     # 編排 5 服務、app-net 網路、pgdata volume、db healthcheck
    nginx/Dockerfile       # nginx:1.27-alpine，複製設定＋前端靜態檔
    nginx/nginx.conf        # upstream＋location 轉發規則，/api/<svc>/ 剝前綴 proxy_pass
    frontend/index.html     # 單檔展示頁：架構圖＋三服務狀態卡
    backend-node/           # Dockerfile＋package.json＋server.js（/, /health, /api/users）
    backend-python/         # Dockerfile＋requirements.txt＋app.py（同上三路由）
    backend-rust/           # Dockerfile＋Cargo.toml＋src/main.rs（同上三路由）
    db/init.sql             # 建 visits 表＋3 筆種子資料
```

## 五、運作流程（以 Node 健康檢查為例）

1. 瀏覽器 `GET http://localhost:8080/api/node/health`
2. nginx 命中 `location /api/node/`，`proxy_pass` 剝掉前綴，轉發 `GET /health` 給 `api-node:3000`
3. `server.js` 用 `DATABASE_URL` 連 `db:5432` 執行 `SELECT 1`
4. 回 `{"status":"ok","db":"connected"}`，原路經 nginx 回瀏覽器，前端卡片顯示 OK
5. 後端啟動順序由 `depends_on: db (service_healthy)` 保證 DB 先就緒（`pg_isready` 通過）

## 六、已知問題

- Rust 建置映像須用新版（`rust:bookworm`）：舊版 Cargo（如 1.78）無法解析需 `edition2024` 的新依賴（`crypto-common 0.2.2`），會以 exit 101 失敗
- 若 `Pulling fs layer` 長時間停在 0B，屬該環境對 Docker Hub CDN 連線異常，換網路後重跑即可續建（layer 快取會保留）

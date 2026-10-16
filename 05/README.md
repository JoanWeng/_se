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

## 七、Docker 學習記錄

### 核心觀念

- **Image（映像）**：唯讀模板，如 `postgres:16-alpine`；本專案 4 個後端/代理映像是自己用 Dockerfile 建的
- **Container（容器）**：映像跑起來的實例；`down -v` 會刪容器，Image 留下，所以重建很快
- **Volume**：DB 資料存在 `pgdata` volume，容器刪掉資料還在；`down -v` 才會清掉
- **Network**：自訂 `app-net` 讓 5 容器用服務名互連（`db`、`api-node`…），只有 nginx 的 8080 對外
- **Layer 快取**：Dockerfile 每行一層，沒變的行直接重用；改 `main.rs` 只會重跑 Rust 編譯那層之後

### Dockerfile 常用指令（本專案實際用到的）

| 指令 | 作用 | 範例出處 |
|---|---|---|
| `FROM` | 基底映像，`AS builder` 命名供 multi-stage 用 | rust builder 階段 |
| `WORKDIR` | 容器內工作目錄 | 各後端 `/app` |
| `COPY` | 複製建置 context 檔案進映像 | 注意 context 路徑（nginx 用專案根當 context） |
| `RUN` | 建置期執行（裝套件、編譯） | `npm install`、`cargo build --release` |
| `EXPOSE` | 宣告端口（僅文件用，對外仍靠 compose ports） | 3000/5000/8000/80 |
| `CMD` | 容器啟動命令 | `node server.js`、`./api-rust` |

### Compose 常用欄位（本專案實際用到的）

- `build: {context, dockerfile}` 指定怎麼建；`image:` 直接用現成映像（db）
- `ports: "8080:80"` 本機:容器；`environment` 傳 `DATABASE_URL` 等設定
- `depends_on: db: {condition: service_healthy}` 等 DB 的 `healthcheck`（`pg_isready`）通過才啟動後端
- `volumes` 掛載 DB 資料＋唯讀掛 `init.sql` 到 `/docker-entrypoint-initdb.d/`（首次啟動自動執行建表）

### 常用指令

```bash
docker compose up --build -d   # 建置＋背景啟動
docker compose ps              # 看容器狀態（要在有 yml 的目錄下）
docker compose logs -f <服務>   # 追 log；--tail=30 只看尾段
docker compose down / down -v  # 停；-v 連 volume 全清
docker images                  # 看本機映像（重建快的原因）
docker rmi <映像> / builder prune -f  # 從零建置前清映像＋建置快取
docker compose build --progress=plain <服務>  # 看完整建置輸出抓錯
```

### 這次學到的除錯經驗

1. 建置錯先看**第一個** `error`（如 `edition2024` → 換新版 Rust 基底），exit code 只是總稱
2. `grep "^error"` 沒東西就 `tail` 看全文；build 輸出預設是摺疊的進度條，要加 `--progress=plain`
3. `curl` 通但瀏覽器空白 → 先分清是伺服器還是瀏覽器問題（`curl -w HTTP:%{http_code}`）；localhost 只對本機有效，他機要用 LAN IP
4. 本機防火牆 `ufw inactive`＋容器綁 `0.0.0.0`，區網連不上就是上層網路擋的

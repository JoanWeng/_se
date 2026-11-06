# 留言板 Guestbook（Cloudflare 全端站）

一個部署在 Cloudflare 的留言板網站：前台留言 / 刪除，後台管理（密碼登入、無須留言密碼刪除、查看 IP、封鎖 IP）。整站只有一個 Cloudflare Worker，同時服務網頁與 API，資料存放在 Cloudflare D1。

- 正式網址：<https://se07-guestbook.sehw07.workers.dev>
- 管理後台：`/joan.html`

---

## 1. 快速導覽

| 區塊 | 路徑 | 說明 |
| --- | --- | --- |
| 留言板頁面 | `/` | public/index.html |
| 管理後台 | `/joan.html` | public/joan.html |
| 公開 API | `/api/messages` | 列表、新增、刪除（需留言密碼） |
| 管理 API | `/api/admin/*` | 登入、列表（含 IP）、管理刪除、封鎖 |

## 2. 功能

### 前台（留言板）
- 參訪者可自由寫留言（暱稱 + 內容 + 刪除密碼，不需註冊）
- 依時間倒序列出；每頁 20 筆分頁
- 留言以**樓層編號**顯示（最上面為最新一則）；這是顯示用編號，與資料庫 ID 不同
- 用「留言時設定的密碼」可刪除自己的留言
- ID 說明：留言刪除後其資料庫 ID 永久空出且不會再被使用，避免留言被誤認與避免誤刪他人留言

### 後台（管理後台）
- 密碼登入取得簽章 token（8 小時有效）
- 不需留言密碼即可刪除任何留言
- 查看每則留言者的公網 IP
- 封鎖 / 解除封鎖 IP（被封鎖者無法留言）
- 如果連續輸錯多次管理員密碼，會被鎖住並要求稍後重試

### 應用程式
- 留言速率限制（5 分鐘內同一 IP 最多 5 則）
- XSS 防護：內容一律以純文字渲染
- SQL injection 防護：全程 prepared statement
- 管理員密碼存放於 Cloudflare Secret（不進 git、不出現在前端或後台程式碼）

## 3. 架構與流程

```
瀏覽器
   │  HTTPS
   ▼
Cloudflare 邊緣網路（全球 300+ 節點，自動 DDoS 阻擋）
   │
   ▼
Cloudflare Worker「se07-guestbook」(單一 Worker = 前 + 後端)
   ├─ GET /            → 靜態資產（ Workers Static Assets：public/ 目錄）
   ├─ GET/POST/DELETE /api/messages*   → Hono 路由
   └─ DELETE/GET/POST /api/admin/*
   │
   ▼（binding）
Cloudflare D1「guestbook」（邊緣 SQLite 資料庫）
   ├─ messages           留言資料（含留言密碼 SHA-256 hash、發文 IP）
   ├─ banned             封鎖名單
   └─ admin_attempts     管理登入失敗次數（速率限制用）
```

### 一次留言的完整流程
1. 使用者在 `index.html` 填暱稱/留言/密碼
2. `public/app.js` 以 `fetch` 打 `POST /api/messages`
3. Worker 驗證是否為封鎖 IP → 驗證速率限制 → 驗證欄位長度
4. 密碼以 SHA-256 hash 後插入 `messages` 個別記錄，並記下 `cf-connecting-ip`
5. 前端重新抓列表，留言以 `textContent` 渲染純文字內容

### 管理後台流程
1. `POST /api/admin/login`：驗證密碼（失敗會記錄到 `admin_attempts` 做速率限制）
2. 登入成功發放 token：`時間戳 + HMAC-SHA256 簽章`（金鑰為管理員密碼）
3. 每次 admin API 請求帶 `Authorization: Bearer <token>`，Workers 重新計算 HMAC 驗簽（8 小時過期）
4. token 存在瀏覽器 `sessionStorage`（關閉分頁即失效），不落 cookie/localStorage

## 4. 專案結構

```
.
├── src/
│   └── index.ts          # Worker 主程式：Hono 路由 + D1 查詢（前 + 後端 API）
├── public/               # 靜態資產（部署時上傳到 Cloudflare）
│   ├── index.html        # 留言板頁面
│   ├── style.css         # 全站樣式
│   ├── app.js            # 留言板前端邏輯（fetch + 分頁 + 刪除）
│   ├── joan.html         # 管理後台頁面
│   └── joan.js           # 管理後台前端邏輯
├── schema.sql            # D1 資料表結構
├── wrangler.jsonc        # Worker 設定：名稱、D1 binding、靜態資產目錄
├── .dev.vars             # 本地開發環境變數（在 .gitignore 中，不進 git）
├── test.ps1              # 公開區功能測試（13 項）
├── test_admin.ps1        # 管理後台測試（本地會跑連續登入鎖定，正式環境跳過）
├── GUESTBOOK_PLAN.md     # 專案規劃
├── CLOUDFLARE_DEPLOY_PLAN.md  # 部署規劃
└── README.md             # 本文件
```

`wrangler.jsonc` 核心內容：

```jsonc
{
  "name": "se07-guestbook",
  "main": "src/index.ts",
  "assets": { "directory": "./public" },
  "d1_databases": [
    { "binding": "DB", "database_name": "guestbook", "database_id": "45621..." }
  ]
}
```

## 5. API 文件

### 公開

| Method | 路徑 | 說明 | 參數/Body |
| --- | --- | --- | --- |
| GET | `/api/messages?page=N` | 留言列表（時間倒序、20 筆/頁） | `page` |
| POST | `/api/messages` | 新留言 | `{name, content, password}` |
| DELETE | `/api/messages/:id` | 刪除（需留言密碼） | body `{password}` |

- 新增成功回 `201 {id}`；欄位無效 `400`；連續留言過快 `429`；刪除密碼錯誤 `403`

### 管理（需 `Bearer <token>`）

| Method | 路徑 | 說明 |
| --- | --- | --- |
| POST | `/api/admin/login` | 回 `{token}` |
| GET | `/api/admin/messages?page=N` | 列表含 IP |
| DELETE | `/api/admin/messages/:id` | 直接刪除（免留言密碼） |
| GET | `/api/admin/banned` | 封鎖名單 |
| POST | `/api/admin/ban` | 封鎖 `{ip, reason}` |
| DELETE | `/api/admin/ban/:ip` | 解除封鎖 |

## 6. 如何使用

### 首次建置（本地）
```bash
npm install                          # 安裝 hono 到 node_modules
deno run -A npm:wrangler d1 execute guestbook --local --file=schema.sql   # 建本地 D1
```

### 本地開發
```bash
deno run -A npm:wrangler dev   # 打開 http://127.0.0.1:8787
```
- 本地環境變數（管理員密碼）存於 `.dev.vars`
- 本地 D1 資料在 `.wrangler/state/`（不影響線上）

### 測試
```bash
# 啟動 dev 後另開終端
powershell -ExecutionPolicy Bypass -File test.ps1                # 公開區 13 項
powershell -ExecutionPolicy Bypass -File test_admin.ps1          # 管理區 13 項
```
- 對正式環境測試時可傳入網址：`test.ps1 -Url https://<正式網址>`
- `test_admin.ps1` 對正式環境時會自動略過「登入錯誤連續打」測試，避免鎖到管理者自己

### 部署到線上（首次）
```bash
deno run -A npm:wrangler login                                       # 登入 Cloudflare
deno run -A npm:wrangler d1 create guestbook                         # 建立 D1，寫回 wrangler.jsonc
deno run -A npm:wrangler d1 execute guestbook --remote --file=schema.sql -y   # 建遠端表
deno run -A npm:wrangler secret put ADMIN_PASSWORD                   # 設管理員密碼（互動輸入）
deno run -A npm:wrangler deploy                                      # 部署
```

### 日常更新
```bash
deno run -A npm:wrangler deploy         # 有改 code / 靜態資產後重新部署
```

### 更換管理員密碼
```bash
echo "新密碼" | deno run -A npm:wrangler secret put ADMIN_PASSWORD   # 立即生效，不用重新部署
```

### 首次綁自訂網域
1. Cloudflare Dashboard → 託管域（或先把既有域名 nameserver 改為 Cloudflare）
2. Worker → Settings → Domains & Routes → Add Custom Domain
3. 自動建立 CNAME + 免費 SSL 憑證

### 備份資料
```bash
deno run -A npm:wrangler d1 export guestbook --remote --output backup.sql
```

## 7. Cloudflare 應用說明

| 使用的 Cloudflare 服務 | 在本專案的應用 |
| --- | --- |
| **Workers** | 執行 Hono API（前 + 後端在同一個 Worker），另可透過 Workers 邊緣詳細控制與限制策略 |
| **Static Assets** | 直接設定靜態資源目錄，自動 global 分布的 CDN 分發（免於部署差異） |
| **D1** | 邊緣 SQLite 資料庫，存放留言 / 封鎖名單 / 登入嘗試；使用 prepared statement 保護查詢 |
| **Secrets** | 管理員密碼 (`ADMIN_PASSWORD`) 存放於 Workers Secrets，原始值不進 git、不出現在程式碼 |
| **workers.dev 子網域** | 帳號層級子網域 `sehw07.workers.dev`，註冊於該帳號、隨部署立即可用 |
| **SSL/TLS（免費 Universal SSL）** | 自動簽發憑證，全站 HTTPS |
| **DDoS 保護** | 邊緣內建 L3/L4/L7 攻擊防護 |
| **可搭配 WAF / Cloudflare Access** | 若未來要更強的後台管理，可用 WAF（封鎖 `/joan.html`）或 Access（公司 SSO 登入後台） |

### 免費方案限額（足夠一個留言板）
- Workers：每日 100,000 請求
- D1：每日 5,000,000 列讀取 / 100,000 列寫入、5GB 儲存
- 網址只要 Cloudflare 帳號存在就會一直有效；建議帳號開啟 two-factor 2FA 防帳號被偷

## 8. 已知限制 / 未來方向

- 留言速率限制用 D1 記 IP 計數，如果攻擊者換 IP（代理人矩陣）仍可繞過
- 管理員密碼為單一密碼，沒有雙因素驗證
- 目前不支援留言回覆、編輯（規劃見 `GUESTBOOK_PLAN.md`）
- 快取：Worker 不快取 API 回應；靜態資產有專案內檔案完整性保護

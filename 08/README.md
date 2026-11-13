# @nqucsie111310512/message-board

留言板（Guestbook）後端套件：一個函式建立整套 Cloudflare Workers + D1 留言板
API，使用 Hono 框架。

移植自已上線的 [se07-guestbook](https://se07-guestbook.sehw07.workers.dev)
Worker，HTTP 路徑與行為完全相同，並將各種限制改成可設定。內建：

- 免註冊留言（暱稱 + 內容 + 刪除密碼）、分頁列表
- 以留言密碼刪除自己的留言（SHA-256 雜湊比對，不存明文）
- 管理後台 API：密碼登入取得 HMAC 簽章 token、免留言密碼刪除、查看留言者
  IP、封鎖/解除封鎖 IP
- 防護：留言速率限制、管理登入失敗鎖定、prepared statement 防 SQL injection

> 安裝與使用文件的線上版：<https://jsr.io/@nqucsie111310512/message-board>

## 快速開始

### 1. 建立 Worker 專案

```bash
deno init my-message-board
cd my-message-board
deno add jsr:@nqucsie111310512/message-board
deno add npm:hono
```

### 2. 寫 `src/index.ts`

```ts
import { createGuestbookApp } from "jsr:@nqucsie111310512/message-board@1";

export default createGuestbookApp();
```

### 3. 設定 `wrangler.jsonc`

```jsonc
{
  "name": "my-message-board",
  "main": "src/index.ts",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "message-board",
      "database_id": "<你的 D1 id>"
    }
  ]
}
```

### 4. 建資料表、設管理密碼、部署

```bash
deno run -A npm:wrangler d1 create message-board        # 取得 database_id
deno run -A npm:wrangler d1 execute message-board --remote --file=schema.sql -y
deno run -A npm:wrangler secret put ADMIN_PASSWORD
deno run -A npm:wrangler deploy
```

也可以在程式裡直接建表（不用 schema.sql）：

```ts
import { SCHEMA_SQL } from "jsr:@nqucsie111310512/message-board@1";

export default {
  async fetch(req: Request, env: Env) {
    await env.DB.exec(SCHEMA_SQL); // 資料表已存在時無副作用
    return app.fetch(req, env);
  },
};
```

## API

需要綁定 `DB`（D1）與 `ADMIN_PASSWORD`（Secret）。錯誤格式統一
`{ error: "..." }`。

### 公開

| Method | 路徑                   | 說明                                                                |
| ------ | ---------------------- | ------------------------------------------------------------------- |
| GET    | `/api/messages?page=N` | 列表（時間倒序、`pageSize` 筆/頁）→ `{items, page, maxPage, total}` |
| POST   | `/api/messages`        | 新留言 `{name, content, password}` → `201 {id}`                     |
| DELETE | `/api/messages/:id`    | body `{password}`；正確 `204`、錯誤 `403`、不存在 `404`             |

- 欄位限制：`name` 1–`nameMax` 字、`content` 1–`contentMax` 字、`password`
  `passwordMin`–`passwordMax` 字
- 同 IP 於 `rateLimitWindowMinutes` 分鐘內超過 `rateLimitMax` 則回 `429`；被封鎖
  IP 回 `403`

### 管理（`Authorization: Bearer <token>`）

| Method | 路徑                         | 說明                                           |
| ------ | ---------------------------- | ---------------------------------------------- |
| POST   | `/api/admin/login`           | `{password}` 比對 `ADMIN_PASSWORD` → `{token}` |
| GET    | `/api/admin/messages?page=N` | 列表含 `ip`                                    |
| DELETE | `/api/admin/messages/:id`    | 免留言密碼刪除                                 |
| GET    | `/api/admin/banned`          | 封鎖名單                                       |
| POST   | `/api/admin/ban`             | `{ip, reason}` 封鎖（重複封鎖自動跳過）        |
| DELETE | `/api/admin/ban/:ip`         | 解除封鎖                                       |

- token 簽章：`過期時間戳 + HMAC-SHA256`（金鑰即
  `ADMIN_PASSWORD`，換密碼立即失效），預設 8 小時
- 登入失敗於 `adminAttemptWindowMinutes` 分鐘內達 `adminAttemptMax` 次即鎖定回
  `429`

## 選項

`createGuestbookApp(options?)`，全部有預設值（見 `DEFAULT_OPTIONS`）：

| 選項                                            | 預設               | 說明               |
| ----------------------------------------------- | ------------------ | ------------------ |
| `pageSize`                                      | 20                 | 每頁留言數         |
| `nameMax` / `contentMax`                        | 20 / 500           | 暱稱、內容長度上限 |
| `passwordMin` / `passwordMax`                   | 4 / 64             | 刪除密碼長度範圍   |
| `rateLimitWindowMinutes` / `rateLimitMax`       | 5 / 5              | 留言速率限制       |
| `adminAttemptWindowMinutes` / `adminAttemptMax` | 15 / 10            | 管理登入失敗鎖定   |
| `tokenTtlMs`                                    | 28800000（8 小時） | 管理 token 有效期  |

```ts
export default createGuestbookApp({ pageSize: 50, rateLimitMax: 3 });
```

## 搭配前端

套件只含後端 API。靜態頁面用 Workers Static Assets 掛自己的 `public/`，前端以
`fetch` 打 `/api/*` 即可（與原專案前端相容）。XSS 防護：請以 `textContent`
渲染留言內容。

## 開發本套件

```bash
deno task test      # 15 個測試（in-memory D1 mock，不需 Cloudflare 帳號）
deno task check     # 型別檢查
deno publish --dry-run --allow-dirty   # 發佈演練
```

## License

MIT

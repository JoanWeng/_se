# 06 留言板：單元 / 系統 / e2e 三種測試

留言板網頁應用（新增、刪除留言），**Node.js + Rust 雙後端**（兩者實作同一組 Web API），並針對它完成三個層次的測試。

## 一、怎麼使用

### 0. 環境需求與安裝

- [Node.js](https://nodejs.org/) 20+（LTS）
- [Rust](https://www.rust-lang.org/) 1.75+（只在跑 Rust 後端／`E2E_RUST=1` 時需要）

```bash
cd 06
npm install                      # 安裝 npm 套件
npx playwright install chromium  # e2e 測試用的無頭瀏覽器
```

### 1. 打開網站玩玩

```bash
npm start          # Node 後端 + 前端網頁 → http://localhost:3000
```

瀏覽器打開 <http://localhost:3000>，輸入暱稱與留言內容即可新增、刪除。
頁面上方的「後端」下拉選單可即時切換 Node.js / Rust 後端（切 Rust 前先啟動它：`npm run start:rust`）。

### 2. 跑三種測試

```bash
# 單元測試（Node 後端 + 前端模組；Rust 單元測試）
npm run test:unit
npm run test:rust

# 系統測試（Web API：Node 用 Supertest；Rust 用 cargo test --test api）
npm run test:system
cargo test --manifest-path server-rust/Cargo.toml

# e2e 測試（Playwright 自動起後端 + 無頭瀏覽器，不用手動開服務）
npm run test:e2e              # 對 Node 後端
E2E_RUST=1 npm run test:e2e   # 額外啟動 Rust 後端，測「切換後端 → 經 Rust API 增刪」

# 全部一次跑完
npm run test:all
```

## 二、三種測試測什麼

| 層次 | 測什麼 | 工具 | 位置 |
|------|--------|------|------|
| **1. 單元測試** | 不碰網路的模組內部邏輯：後端留言資料結構、驗證規則；前端驗證／時間格式／API 包裝／HTML 渲染 | Vitest（Node 端跑 jsdom）＋ cargo test | `test/unit/`、`server-rust/src/lib.rs` 內 `#[cfg(test)]` |
| **2. 系統測試（Web API）** | 把後端當黑盒，走完整 HTTP 介面：狀態碼、JSON 格式、CORS、404、錯誤訊息 | Vitest + Supertest（Node 端）；Rust 端用 `tower::ServiceExt::oneshot` 走同一份 Router | `test/system/`、`server-rust/tests/api.rs` |
| **3. e2e 測試** | 開真的無頭瀏覽器，從 UI 操作到清單渲染驗證整條鏈，也會真的切換後端 | Playwright + Chromium | `e2e/` |

三者範圍遞增：單元測模組 → 系統測整個後端的對外介面 → e2e 測「瀏覽器 + 前端 JS + 後端 API」串起來的最終行為。

節選的測試案例：

- **單元**：空白／超長輸入的驗證訊息（前端與兩個後端一字不差）、留言由新到舊排序、`escapeHtml` 防 XSS、`formatTime` 相對時間、網路失敗拋 `ApiError`。
- **系統**：`GET /api/health` 回覆後端名稱、`POST` 去除頭尾空白、`400` 中文錯誤訊息、`DELETE` 二次回 `404`、CORS preflight、靜態頁與 404 JSON。
- **e2e**：標題載入、新增後在最上方、空白內容擋下不新增、`maxlength` 截斷超長輸入、刪除後該則消失、切換到 Rust 後端增刪。

## 三、系統架構

```
Browser
  │  http://localhost:3000（靜態前端由 Node 後端提供）
  ├── 預設 ───▶ Node.js 後端 :3000  （Express）
  └── 下拉選單切換 ──▶ Rust 後端 :8000 （Axum，開 CORS）
                            兩者提供完全相同的 API、相同驗證規則：
                            GET    /api/health
                            GET    /api/messages
                            POST   /api/messages   { name, content }
                            DELETE /api/messages/:id
```

- 暱稱 1～20 字、內容 1～200 字（去除頭尾空白後）；驗證邏輯在前端與兩個後端各自實作一份，行為一致。
- 兩個後端都用記憶體儲存，重啟即清空。

## 四、專案結構

```
06/message-board/
├── package.json / vitest.config.js / playwright.config.js
├── server-node/            # Node.js 後端（Express）
│   └── src/
│       ├── store.js        # 純邏輯：留言資料結構 + 驗證（單元測試對象）
│       ├── app.js          # Express app 工廠（可注入 AppState，方便測試）
│       └── server.js       # 進入點：listen 3000
├── server-rust/            # Rust 後端（Axum）
│   ├── Cargo.toml
│   ├── src/
│   │   ├── lib.rs          # Message/AppState/validate/build_router + #[cfg(test)] 單元測試
│   │   └── main.rs         # 進入點：listen 8000（+ CORS）
│   └── tests/api.rs        # API 整合測試（oneshot 走整個 Router）
├── client/                 # 前端（原生 JS，無框架）
│   ├── index.html / css/style.css
│   └── js/
│       ├── validate.js     # 前端驗證（單元測試對象）
│       ├── format.js       # escapeHtml / 相對時間格式（單元測試對象）
│       ├── api.js          # fetch 包裝、ApiError（單元測試以 mock fetch 測）
│       ├── app.js          # 渲染 + DOM 事件接線
│       └── main.js         # 瀏覽器進入點（測試不會 import 它）
├── test/
│   ├── unit/server/        # Node 後端單元測試
│   ├── unit/client/        # 前端單元測試（jsdom）
│   └── system/             # 系統測試：Supertest 打整個 API
└── e2e/                    # Playwright e2e 測試
```

## 五、設計重點

- **可測性**：Node 的 `createApp()` 允許注入 `AppState`（系統測試可從 seed 資料開始）；Rust 把路由與 `AppState` 邏輯放進 `lib.rs`，同一份程式碼被單元測試、API 測試、真實伺服器共用。
- **前後端一致**：驗證規則與錯誤訊息在 client（JS）、server-node、server-rust 三處各自實作，單元測試斷言訊息一字不差，e2e 再用瀏覽器實測。
- **e2e 沒有清理測試資料的問題**：資料存在記憶體，e2e 每個測試前用真實 API 清空留言板，避免殘留互相干擾。

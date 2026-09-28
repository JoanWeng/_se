# 校務系統 MVP

以 Deno + Fresh 2 實作的校務系統：帳號認證、角色權限、學期班課、學生資料與成績登錄。
後端邏輯與頁面渲染都在同一個 Fresh app 內完成，不需要另外架 API server。

---

## 目錄

- [快速開始](#快速開始)
- [種子帳號](#種子帳號)
- [指令](#指令)
- [功能與畫面](#功能與畫面)
- [權限對照表](#權限對照表)
- [環境變數](#環境變數)
- [專案結構](#專案結構)
- [資料模型](#資料模型)
- [設計解析](#設計解析)
- [安全設計](#安全設計)
- [測試](#測試)
- [已知限制與下一步](#已知限制與下一步)

---

## 快速開始

需求：**Deno 2.9 以上**。除此之外不需要安裝 Node、資料庫 server 或其他工具鏈。

```powershell
deno install            # 安裝依賴（fresh、preact、zod、bcryptjs、djwt…）
deno task db:reset      # 建立資料庫 + 種子資料
deno task dev           # 開發模式 → http://127.0.0.1:5173
```

正式環境：

```powershell
deno task db:reset
deno task build         # 產生 _fresh/
deno task start         # → http://127.0.0.1:8000
```

指定連接埠與環境：

```powershell
$env:PORT = "9000"; deno task start
$env:APP_ENV = "production"; $env:JWT_SECRET = "<至少 32 字元>"; deno task start
```

> `deno task start` 讀的是建置產物，**改了程式碼要先 `deno task build`**；
> 開發時請用 `deno task dev`，Vite 會自動熱更新。

登入後依角色進入不同儀表板，導覽列也會跟著角色變化。

## 種子帳號

帳號與密碼相同，**僅供本機開發使用**。

| 帳號 | 角色 | 資料範圍 |
| --- | --- | --- |
| `admin` | 行政人員 | 全校資料，所有管理頁 |
| `teacher1` | 教師 | 資工一甲導師、程式設計 + 資料庫概論 |
| `teacher2` | 教師 | 資工一乙導師、物件導向程式設計 |
| `student1`～`student6` | 學生 | 學生1～3 在資工一甲，學生4～6 在資工一乙 |

種子資料含 2 個學期、2 個班級、6 位學生、3 門課、9 筆選課、8 筆成績，可直接拿來看成績簿與成績單。

## 指令

| 指令 | 用途 |
| --- | --- |
| `deno task dev` | 開發模式（Vite HMR，預設 5173） |
| `deno task build` | 建置正式版到 `_fresh/` |
| `deno task start` | 啟動建置好的正式版（預設 8000，可用 `PORT` 覆寫） |
| `deno task check` | `deno fmt --check` + `deno lint` + `deno check` |
| `deno task test` | 執行全部測試（記憶體資料庫） |
| `deno task db:migrate` | 執行資料庫遷移 |
| `deno task db:seed` | 寫入種子資料（不刪既有資料） |
| `deno task db:reset` | 刪掉資料庫後重建 + 種子資料 |

## 功能與畫面

| 路由 | 行政 | 教師 | 學生 | 說明 |
| --- | :---: | :---: | :---: | --- |
| `/` | ● | ● | ● | 儀表板：目前學期、常用功能、系統狀態 |
| `/login` `/logout` | ● | ● | ● | 登入／登出，登入有 rate limit |
| `/semesters` | 讀寫 | 讀 | 讀 | 學期建立、日期不可重疊、切換目前學期 |
| `/classes` | 讀寫 | 讀 | 讀 | 班級與導師安排；有人有課時禁止刪除 |
| `/courses` | 讀寫 | 讀自己授課 | 讀自己選修 | 開課、編輯、刪除；有選修或成績時禁止刪除 |
| `/students` | 讀寫 | 讀自己班級 | 讀自己 | 關鍵字／班級／停讀篩選、分頁、停讀復學 |
| `/grades` | 總覽＋代登 | 成績簿 | 成績單 | 批次登錄分數與評語，依學期分組的成績單 |
| `/admin/users` | ● | — | — | 建立帳號、停用復用、重設密碼 |

學生看不到管理表單（不是按鈕藏起來，是後端也擋）；教師看不到別人的課與別班的學生。

## 權限對照表

權限定義在 `lib/roles.ts`，route 與 `lib/*` 雙層把關。

| 能力 | admin | teacher | student |
| --- | :---: | :---: | :---: |
| 查看全校學生 | ● | 限自己班級 | 限自己 |
| 維護學生資料 | ● | — | — |
| 維護班級／課程／學期 | ● | — | — |
| 登錄成績 | ● | 限自己授課課程 | — |
| 查看成績 | ● | 限自己授課課程 | 限自己 |
| 管理帳號 | ● | — | — |

未登入者造訪任何頁面一律 302 導向 `/login?next=…`；已登入但權限不足的 POST 回 403。

## 環境變數

複製 `.env.example` 成 `.env` 後修改（`.env` 已在 `.gitignore` 中）。

| 變數 | 預設 | 說明 |
| --- | --- | --- |
| `APP_ENV` | `development` | `development`／`test`／`production`，決定資料庫檔名與 cookie 是否加 `Secure` |
| `DB_PATH` | 見下 | SQLite 檔案路徑，或 `:memory:` |
| `JWT_SECRET` | 開發用弱金鑰 | JWT 簽章金鑰，**`APP_ENV=production` 時必填且至少 32 字元**，否則 import 階段就會失敗 |

未指定 `DB_PATH` 時的預設位置：

- Windows：`%LOCALAPPDATA%\school-mvp\<APP_ENV>.db`
- Linux/macOS：`~/.local/share/school-mvp/<APP_ENV>.db`

> 刻意不放專案目錄：課程專案常放在 OneDrive 等雲端同步資料夾，
> SQLite 的 WAL 檔在同步過程中可能被搬移或鎖住，導致資料庫損毀。

產生金鑰：

```bash
deno eval 'console.log(crypto.randomUUID()+crypto.randomUUID())'
```

## 專案結構

```
.
├── main.ts               Fresh App 組裝：staticFiles、csrf()、全域中介層
├── utils.ts              define / define.handlers / define.page 型別輔助
├── client.ts             瀏覽器端進入點（Vite 用）
├── vite.config.ts
├── deno.json             tasks、imports、lint/fmt 設定
├── migrations/
│   └── 001_init.sql      全部 schema：12 張表、25 個索引、19 個外鍵
├── lib/                  業務邏輯（不依賴 HTTP，可獨立測試）
│   ├── env.ts            環境變數與路徑解析
│   ├── db.ts             SQLite 單例、PRAGMA
│   ├── migrate.ts        遷移執行器
│   ├── auth.ts           密碼驗證、JWT 簽發、session 解析
│   ├── auth-types.ts     ctx.state.user 的型別
│   ├── roles.ts          角色與權限矩陣
│   ├── password.ts       bcrypt 封裝
│   ├── rate-limit.ts     登入嘗試限流
│   ├── audit.ts          稽核記錄（全系統共用一支）
│   ├── result.ts         寫入結果型別 ok() / fail()
│   ├── http.ts           表單、redirect、query string、Zod 訊息格式化
│   ├── users.ts          帳號 CRUD
│   ├── semesters.ts      學期
│   ├── classes.ts        班級
│   ├── courses.ts        課程
│   ├── students.ts       學生（含分頁與角色範圍）
│   └── grades.ts         成績
├── routes/               Fresh 路由（每個檔案＝一個頁面）
│   ├── _middleware.ts    解析登入狀態、未登入導向
│   ├── index.tsx         儀表板
│   ├── login.tsx  logout.ts
│   ├── semesters.tsx  classes.tsx  courses.tsx  students.tsx  grades.tsx
│   └── admin/
│       ├── _middleware.ts  admin 專屬守門
│       └── users.tsx
├── components/           Flash（訊息＋分頁）、Layout（版面＋導覽列）
├── assets/styles.css     純 CSS，無框架
├── scripts/
│   ├── migrate.ts  seed.ts
│   └── serve.ts          正式版 server（支援 HOST／PORT）
└── tests/                73 個測試
```

`lib/` 與 `routes/` 的分工是刻意的：**所有權限判斷與資料驗證都在 `lib/`**，
route 只負責解析請求、呼叫 `lib/`、把結果渲染成頁面。同一段驗證規則因此可以被
測試直接呼叫，也可以在多個頁面重用。

## 資料模型

12 張表（`migrations/001_init.sql`），全部用 `STRICT`，並加上 19 個外鍵、25 個索引、CHECK 約束：

| 分組 | 資料表 |
| --- | --- |
| 身分 | `users`、`sessions` |
| 學籍 | `teachers`、`students`、`classes`、`courses`、`enrollments` |
| 成績 | `semesters`、`grades` |
| 通知 | `announcements`、`announcement_reads`（schema 已建，功能未做） |
| 稽核 | `audit_logs` |

架構文件列了但**刻意未實作**的兩張表：

- `attendance`（出缺勤）— 決定先做成績，點名留待第二階段
- `password_resets`（自助重設連結）— 本專案不寄 Email，密碼一律由 admin 重設

幾個刻意的設計：

- **不做實體刪除。** 學生、教師、課程都用 `is_active` 標記停用，歷史成績才不會斷鏈。
- **成績不存學期以外的關聯。** `grades.semester_id` 一律由 `courses.semester_id` 帶入，
  同一門課不可能同時屬於兩個學期，讓呼叫端再傳一次只會製造不一致。
- **唯一性靠 partial／複合索引**，例如班級 `(name, year)`、成績 `(student_id, course_id, semester_id)`，
  讓「同一門課同一學期不會有兩筆成績」由資料庫保證，程式只是提早擋下更好的訊息。
- **`role` 是字串**而非 enum，未來要加家長角色不用改 schema。

## 設計解析

### 寫入結果用型別，不用例外

`lib/result.ts` 的 `WriteResult = { ok: true, message } | { ok: false, error }`：

- 這些失敗是「使用者輸入不對」，該轉成 400 + 訊息，不是 500。
- 同一個函式常有多種合理的失敗原因（「日期重疊」「找不到班級」「名單外的學生」），
  用字串訊息回傳比定義一堆 error class 省事，MVP 階段比較划算。
- 真的例外（SQLite 連線失敗）仍然往外拋。

### 權限範圍下推到 SQL

查詢範圍寫進 `WHERE`，而不是撈出來在程式裡過濾：

```ts
// lib/students.ts
if (user.role === "teacher") {
  return { sql: `WHERE s.class_id IN (
      SELECT c2.id FROM classes c2 WHERE c2.homeroom_teacher_id = ?)`, ... };
}
if (user.studentId === null) return { sql: "WHERE 1 = 0", params: [] };
```

後者等於全校資料都進過 process 才被丟掉。取不到身份時一律給「不會命中任何一列」
的條件（`1 = 0`），**寧可查不到也不要全開**。

### 成績名冊的來源

一門課只對應一個班級，所以名冊＝「該課程所屬班級的學生」∪「另外選修的學生」，
兩邊用 `UNION` 合併避免重複列。停讀學生仍留在名單裡（可查看、可修正既有成績），
但畫面會標示「停讀」。

### 分數與評語都清空＝取消登錄

成績簿是整份表單一起送出，所以包在單一交易裡：整門課都存進去，或完全不動。
不會出現「一半改了、一半沒改」。

### 表單驗證統一在 schema

用 Zod 描述欄位規則，錯誤訊息轉成中文後顯示在頁面上：

```
第 1 號學生的成績有問題：分數：分數請填 0 到 100 之間的數字，或留空表示未登錄
```

成績簿的 `score_<studentId>` 欄位解析後還會比對**名冊白名單**，
表單被竄改塞入別的 studentId 會被拒絕。

### Fresh 的 CSRF

`main.ts` 掛 `csrf()`，它依 `Sec-Fetch-Site` 與 `Origin` 判定同源，跨站 POST 回 403。
不需要自己發放 token 表單欄位（那是傳統 double-submit 做法，Fresh 已內建）。

## 安全設計

| 項目 | 作法 |
| --- | --- |
| 密碼 | `bcryptjs` 雜湊，不存明文；重設由 admin 執行，不寄 Email |
| Session | JWT 只放 `sub`／`sid`／`ver`／`exp` |
| 角色來源 | **不信任 token**：角色、姓名、附屬身份每次從 DB 讀取 |
| Token 失效 | 改密、停用帳號、切換 `JWT_SECRET` 都會讓舊 token 立即失效（靠 `ver` 與 `sid`） |
| Cookie | `HttpOnly` + `SameSite=Lax`，正式環境加 `Secure` |
| 登入限流 | 每 IP 每分鐘 5 次，超過回 429 並附 `Retry-After` |
| 輸入驗證 | 所有表單走 Zod；使用者文字參數化，LIKE 另加萬用字元跳脫 |
| 稽核 | 帳號異動、班課、成績等寫入 `audit_logs`；密碼本身不寫 |
| 正式環境 | `JWT_SECRET` 缺值或少於 32 字元在啟動階段就失敗，不會靜默用弱金鑰 |

## 測試

```bash
deno task test     # 73 passed
deno task check    # fmt + lint + type check
```

| 測試檔 | 數量 | 涵蓋 |
| --- | --- | --- |
| `tests/db_test.ts` | 10 | schema、外鍵、CHECK、唯一索引、migration 可重複執行 |
| `tests/auth_test.ts` | 21 | 密碼、登入、JWT 時效、session 解析、rate limit、未知角色拒絕 |
| `tests/academic_test.ts` | 25 | 學期重疊、班級唯一性、課程／學生的 CRUD 與角色查詢範圍、分頁 |
| `tests/grades_test.ts` | 17 | 名冊來源、成績範圍校驗、權限範圍、交易 rollback、成績單範圍 |

每個測試都用 `freshDb()` 拿到一份全新的 `:memory:` 資料庫（schema 由 migration 重建），
**不會碰到開發或正式資料**。測試涵蓋的是 `lib/` 的業務規則，不依賴 HTTP 層。

手動驗證的建議路線見「功能與畫面」：分別用四個角色登入，確認看得到的資料範圍正確，
再試著把別人的 id 塞進網址，確認後端有擋。

## 已知限制與下一步

尚未實作（依架構文件的開發順序）：

1. **公告通知** — schema 已建（`announcements`、`announcement_reads`），缺發布、已讀追蹤與首頁列表
2. **CSV 匯出** — 成績單匯出；查詢層已預留 `semester_id` 篩選，匯出不需改 schema
3. **檔案上傳／點名** — 架構文件列為可選，現階段優先做成績
4. **部署** — 需選有 persistent volume 的平台（Deno Deploy 的檔案系統不持久）
5. **備份排程與 Sentry** — 見架構文件「維運」

開發階段的取捨：

- 不做 enrollment 管理介面；名冊改以班級學生為主，跨班選修需要直接操作 `enrollments`
- 密碼重設不做自助流程（架構文件有「忘記密碼」設計，但本專案決定不寄 Email）
- 沒有前端測試框架，頁面行為以 `deno task check` + 手動 E2E 驗證

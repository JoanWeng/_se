import { App, csrf, staticFiles } from "fresh";
import { define, type State } from "./utils.ts";
import { getDb, getDbPath } from "./lib/db.ts";

export const app = new App<State>();

// 開機就開資料庫並跑 migration：壞掉的 schema 要在啟動時就爆，
// 不要等到第一個使用者開頁面才發現。
getDb();
console.log(`[db] ${getDbPath()}`);

const logger = define.middleware((ctx) => {
  console.log(`${ctx.req.method} ${ctx.req.url}`);
  return ctx.next();
});

app.use(staticFiles());
// 內建的 CSRF 防護：表單都是 POST，沒有這層保護的話
// 任何外部網站都能偷偷用使用者的 cookie 發出請求
app.use(csrf());
app.use(logger);

// Include file-system based routes here
app.fsRoutes();

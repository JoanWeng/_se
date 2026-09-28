/**
 * /admin/* 的守門員。所有頁面預設只有 admin 能進，
 * 需要開放給其他角色時在個別頁面另外判斷，不要在這裡放行整個目錄。
 */
import { forbidden } from "../../lib/http.ts";
import { define } from "../../utils.ts";

export const handler = define.middleware((ctx) => {
  if (ctx.state.user?.role !== "admin") return forbidden();
  return ctx.next();
});

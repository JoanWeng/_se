/**
 * 全域中介層：解析登入狀態 + 保護所有需要登入的頁面與 API。
 *
 * 預設「全部都要登入」，只有 PUBLIC_PATHS 明列的免驗證。
 * 這種白名單式的預設比逐頁標記要安全 —— 忘記加標記的結果是
 * 頁面被擋住（ annoying 但安全），反過來忘記擋就會直接漏。
 */
import { getCookies } from "@std/http/cookie";
import { resolveSession, SESSION_COOKIE } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { define } from "../utils.ts";

const PUBLIC_PATHS = new Set(["/login", "/logout", "/api/health"]);

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export const handler = define.middleware(async (ctx) => {
  // 一定要先給 null。State 剛建立時是空物件，ctx.state.user 會是 undefined，
  // 而 `undefined === null` 是 false —— 守門條件會整個失效，未登入就放行。
  ctx.state.user = null;
  ctx.state.sessionId = null;

  const token = getCookies(ctx.req.headers)[SESSION_COOKIE];
  if (token !== undefined && token !== "") {
    const resolved = await resolveSession(token);
    if (resolved !== null) {
      ctx.state.user = resolved.user;
      ctx.state.sessionId = resolved.sid;
    }
  }

  const { pathname } = new URL(ctx.req.url);
  if (PUBLIC_PATHS.has(pathname)) return ctx.next();

  if (ctx.state.user === null) {
    // API 沒有瀏覽器可以接住 redirect，回 401 讓前端自己處理
    if (isApiPath(pathname)) {
      return json({ error: "尚未登入" }, { status: 401 });
    }
    const next = encodeURIComponent(pathname + new URL(ctx.req.url).search);
    return ctx.redirect(`/login?next=${next}`, 302);
  }

  return ctx.next();
});

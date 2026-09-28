import { deleteCookie } from "@std/http/cookie";
import { cookieOptions, revokeSession, SESSION_COOKIE } from "../lib/auth.ts";
import { writeAudit } from "../lib/audit.ts";
import { define } from "../utils.ts";

/**
 * 只接受 POST。用 GET 做登出會被瀏覽器預先載入、爬蟲、預測網址攻擊觸發。
 */
export const handler = define.handlers({
  GET() {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "POST" },
    });
  },

  POST(ctx) {
    const user = ctx.state.user;
    if (ctx.state.sessionId !== null) revokeSession(ctx.state.sessionId);

    if (user !== null) {
      writeAudit({
        userId: user.id,
        action: "logout",
        targetTable: "users",
        targetId: user.id,
      });
    }

    const headers = new Headers();
    headers.set("location", "/login");
    deleteCookie(headers, SESSION_COOKIE, cookieOptions);
    return new Response(null, { status: 302, headers });
  },
});

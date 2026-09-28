import { z } from "zod";
import { setCookie } from "@std/http/cookie";
import { page } from "fresh";
import {
  cookieOptions,
  login,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "../lib/auth.ts";
import {
  formatZodError,
  formToRecord,
  getClientIp,
  safeRedirectTarget,
} from "../lib/http.ts";
import { checkRateLimit } from "../lib/rate-limit.ts";
import { writeAudit } from "../lib/audit.ts";
import { define } from "../utils.ts";

/** 架構文件：登入 API 每 IP 每分鐘 5 次 */
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 60_000;

const loginSchema = z.object({
  username: z.string().min(1, "請輸入帳號").max(64),
  password: z.string().min(1, "請輸入密碼").max(200),
});

interface LoginData {
  error: string | null;
  next: string;
  username: string;
}

export const handler = define.handlers({
  GET(ctx) {
    if (ctx.state.user !== null) return ctx.redirect("/", 302);
    const next = safeRedirectTarget(
      new URL(ctx.req.url).searchParams.get("next"),
    );
    return page<LoginData>({ error: null, next, username: "" });
  },

  async POST(ctx) {
    const ip = getClientIp(ctx.req);
    const limit = checkRateLimit(
      `login:${ip ?? "unknown"}`,
      LOGIN_LIMIT,
      LOGIN_WINDOW_MS,
    );
    if (!limit.allowed) {
      writeAudit({
        userId: null,
        action: "login_rate_limited",
        targetTable: "users",
        detail: { ip },
      });
      return page<LoginData>(
        {
          error: `嘗試次數過多，請 ${limit.retryAfterSeconds} 秒後再試`,
          next: "/",
          username: "",
        },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        },
      );
    }

    const raw = formToRecord(await ctx.req.formData());
    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) {
      return page<LoginData>(
        {
          error: formatZodError(parsed.error),
          next: safeRedirectTarget(raw.next),
          username: raw.username ?? "",
        },
        { status: 400 },
      );
    }

    const result = await login(parsed.data.username, parsed.data.password, {
      ip,
      userAgent: ctx.req.headers.get("user-agent"),
    });

    if (!result.ok) {
      // 錯誤訊息刻意不區分「帳號不存在」與「密碼錯誤」
      return page<LoginData>(
        {
          error: "帳號或密碼錯誤",
          next: safeRedirectTarget(raw.next),
          username: parsed.data.username,
        },
        { status: 401 },
      );
    }

    const headers = new Headers();
    headers.set("location", safeRedirectTarget(raw.next));
    setCookie(headers, {
      name: SESSION_COOKIE,
      value: result.token,
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
      ...cookieOptions,
    });
    return new Response(null, { status: 302, headers });
  },
});

export default define.page<typeof handler>(function LoginPage({ data }) {
  return (
    <div class="login-page">
      <form class="card login-card" method="post">
        <h1 class="login-title">校務系統</h1>
        <p class="muted">請使用帳號密碼登入</p>

        {data.error !== null && (
          <div class="alert alert-error">{data.error}</div>
        )}

        <input type="hidden" name="next" value={data.next} />

        <label class="field">
          <span>帳號</span>
          <input
            type="text"
            name="username"
            value={data.username}
            autocomplete="username"
            required
            autofocus
          />
        </label>

        <label class="field">
          <span>密碼</span>
          <input
            type="password"
            name="password"
            autocomplete="current-password"
            required
          />
        </label>

        <button type="submit" class="btn btn-primary btn-block">登入</button>

        <p class="login-hint muted">
          測試帳號：admin / admin、teacher1 / teacher1、student1 / student1
        </p>
      </form>
    </div>
  );
});

/**
 * The guestbook app: public message board API + admin API, ported from the
 * original Cloudflare Worker guestbook (paths and behavior unchanged).
 *
 * @module
 */

import { Hono } from "hono";
import type { Hono as HonoType } from "hono";
import { hashPassword, issueAdminToken, verifyAdminToken } from "./crypto.ts";
import { resolveOptions } from "./options.ts";
import type { GuestbookOptions } from "./options.ts";
import type { D1Database, GuestbookEnv } from "./types.ts";

async function checkIpBanned(db: D1Database, ip: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 AS ok FROM banned WHERE ip = ?1")
    .bind(ip)
    .first();
  return row !== null;
}

function requireInt(value: number, fallback: number): number {
  const n = Math.floor(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Create the guestbook Hono app.
 *
 * Exposes the same HTTP API as the original project:
 *
 * - Public: `GET/POST /api/messages`, `DELETE /api/messages/:id`
 * - Admin:  `POST /api/admin/login`,
 *           `GET /api/admin/messages`,
 *           `DELETE /api/admin/messages/:id`,
 *           `GET /api/admin/banned`,
 *           `POST /api/admin/ban`,
 *           `DELETE /api/admin/ban/:ip`
 *
 * Requires bindings `{ DB, ADMIN_PASSWORD }`.
 *
 * @example Usage in a Cloudflare Worker
 * ```ts
 * import { createGuestbookApp } from "jsr:@nqucsie111310512/message-board@1";
 *
 * export default createGuestbookApp();
 * ```
 *
 * @example With custom limits
 * ```ts
 * import { createGuestbookApp } from "jsr:@nqucsie111310512/message-board@1";
 *
 * export default createGuestbookApp({
 *   pageSize: 50,
 *   rateLimitMax: 3,
 *   tokenTtlMs: 2 * 60 * 60 * 1000,
 * });
 * ```
 */
export function createGuestbookApp(
  options?: GuestbookOptions,
): HonoType<GuestbookEnv> {
  const opts = resolveOptions(options);
  const pageSize = requireInt(opts.pageSize, 20);
  const nameMax = requireInt(opts.nameMax, 20);
  const contentMax = requireInt(opts.contentMax, 500);
  const passwordMin = requireInt(opts.passwordMin, 4);
  const passwordMax = Math.max(passwordMin, requireInt(opts.passwordMax, 64));
  const rateLimitWindowMinutes = requireInt(
    opts.rateLimitWindowMinutes,
    5,
  );
  const rateLimitMax = requireInt(opts.rateLimitMax, 5);
  const adminAttemptWindowMinutes = requireInt(
    opts.adminAttemptWindowMinutes,
    15,
  );
  const adminAttemptMax = requireInt(opts.adminAttemptMax, 10);
  const tokenTtlMs = requireInt(opts.tokenTtlMs, 8 * 60 * 60 * 1000);

  const app = new Hono<GuestbookEnv>();

  app.post("/api/admin/login", async (c) => {
    const ip = c.req.header("cf-connecting-ip") ?? "unknown";

    const attempts = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n
         FROM admin_attempts
        WHERE ip = ?1
          AND created_at > datetime('now', '-${adminAttemptWindowMinutes} minutes')`,
    )
      .bind(ip)
      .first<{ n: number }>();
    if ((attempts?.n ?? 0) >= adminAttemptMax) {
      return c.json({ error: "too many attempts, try again later" }, 429);
    }

    const body = await c.req.json().catch(() => null);
    const password = body ? String(body.password ?? "") : "";
    if (!password || password !== c.env.ADMIN_PASSWORD) {
      await c.env.DB.prepare(
        "INSERT INTO admin_attempts (ip) VALUES (?1)",
      )
        .bind(ip)
        .run();
      return c.json({ error: "wrong password" }, 401);
    }

    return c.json({
      token: await issueAdminToken(c.env.ADMIN_PASSWORD, tokenTtlMs),
    });
  });

  app.use("/api/admin/*", async (c, next) => {
    if (c.req.path === "/api/admin/login") {
      return next();
    }
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const ok = !!token && await verifyAdminToken(c.env.ADMIN_PASSWORD, token);
    if (!ok) {
      return c.json({ error: "unauthorized" }, 401);
    }
    return next();
  });

  app.get("/api/admin/messages", async (c) => {
    const pageRaw = Number(c.req.query("page") ?? "1");
    const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

    const totalRow = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM messages",
    )
      .first<{ n: number }>();
    const total = totalRow?.n ?? 0;
    const maxPage = Math.max(1, Math.ceil(total / pageSize));

    const result = await c.env.DB.prepare(
      `SELECT id, name, content, ip, created_at
         FROM messages
        ORDER BY created_at DESC, id DESC
        LIMIT ?1 OFFSET ?2`,
    )
      .bind(pageSize, (page - 1) * pageSize)
      .run();

    return c.json({ items: result.results, page, maxPage, total });
  });

  app.delete("/api/admin/messages/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: "invalid id" }, 400);
    }
    const result = await c.env.DB.prepare("DELETE FROM messages WHERE id = ?1")
      .bind(id)
      .run();
    if (!result.success || result.meta.changes === 0) {
      return c.json({ error: "not found" }, 404);
    }
    return new Response(null, { status: 204 });
  });

  app.get("/api/admin/banned", async (c) => {
    const result = await c.env.DB.prepare(
      "SELECT ip, reason, created_at FROM banned ORDER BY created_at DESC, ip",
    ).run();
    return c.json({ items: result.results });
  });

  app.post("/api/admin/ban", async (c) => {
    const body = await c.req.json().catch(() => null);
    const ip = body ? String(body.ip ?? "").trim() : "";
    const reason = body ? String(body.reason ?? "").trim() : "";
    if (!ip || ip.length > 64) {
      return c.json({ error: "invalid ip" }, 400);
    }
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO banned (ip, reason) VALUES (?1, ?2)",
    )
      .bind(ip, reason)
      .run();
    return new Response(null, { status: 201 });
  });

  app.delete("/api/admin/ban/:ip", async (c) => {
    const ip = c.req.param("ip");
    if (!ip || ip.length > 64) {
      return c.json({ error: "invalid ip" }, 400);
    }
    const result = await c.env.DB.prepare("DELETE FROM banned WHERE ip = ?1")
      .bind(ip)
      .run();
    if (!result.success || result.meta.changes === 0) {
      return c.json({ error: "not found" }, 404);
    }
    return new Response(null, { status: 204 });
  });

  app.get("/api/messages", async (c) => {
    const pageRaw = Number(c.req.query("page") ?? "1");
    const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

    const totalRow = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM messages",
    )
      .first<{ n: number }>();
    const total = totalRow?.n ?? 0;
    const maxPage = Math.max(1, Math.ceil(total / pageSize));

    const items = await c.env.DB.prepare(
      `SELECT id, name, content, created_at
         FROM messages
        ORDER BY created_at DESC, id DESC
        LIMIT ?1 OFFSET ?2`,
    )
      .bind(pageSize, (page - 1) * pageSize)
      .run();

    return c.json({ items: items.results, page, maxPage, total });
  });

  app.post("/api/messages", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return c.json({ error: "invalid body" }, 400);
    }

    const name = String(body.name ?? "").trim();
    const content = String(body.content ?? "").trim();
    const password = String(body.password ?? "").trim();
    const ip = c.req.header("cf-connecting-ip") ?? "unknown";

    if (!name || name.length > nameMax) {
      return c.json({ error: `name must be 1-${nameMax} chars` }, 400);
    }
    if (!content || content.length > contentMax) {
      return c.json({ error: `content must be 1-${contentMax} chars` }, 400);
    }
    if (password.length < passwordMin || password.length > passwordMax) {
      return c.json(
        { error: `password must be ${passwordMin}-${passwordMax} chars` },
        400,
      );
    }

    if (await checkIpBanned(c.env.DB, ip)) {
      return c.json({ error: "banned" }, 403);
    }

    const rate = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n
         FROM messages
        WHERE ip = ?1
          AND created_at > datetime('now', '-${rateLimitWindowMinutes} minutes')`,
    )
      .bind(ip)
      .first<{ n: number }>();
    if ((rate?.n ?? 0) >= rateLimitMax) {
      return c.json(
        { error: `too many messages, try again later` },
        429,
      );
    }

    const hashed = await hashPassword(password);
    const result = await c.env.DB.prepare(
      `INSERT INTO messages (name, content, password, ip) VALUES (?1, ?2, ?3, ?4)`,
    )
      .bind(name, content, hashed, ip)
      .run();

    return c.json({ id: result.meta.last_row_id }, 201);
  });

  app.delete("/api/messages/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json().catch(() => null);
    const password = body ? String(body.password ?? "").trim() : "";

    if (!Number.isInteger(id) || id <= 0 || !password) {
      return c.json({ error: "invalid request" }, 400);
    }

    const row = await c.env.DB.prepare(
      "SELECT password FROM messages WHERE id = ?1",
    )
      .bind(id)
      .first<{ password: string }>();
    if (!row) {
      return c.json({ error: "not found" }, 404);
    }

    const hashed = await hashPassword(password);
    if (hashed !== row.password) {
      return c.json({ error: "wrong password" }, 403);
    }

    const result = await c.env.DB.prepare("DELETE FROM messages WHERE id = ?1")
      .bind(id)
      .run();
    if (!result.success) {
      return c.json({ error: "delete failed" }, 500);
    }
    return new Response(null, { status: 204 });
  });

  return app;
}

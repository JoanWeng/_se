import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
  ADMIN_PASSWORD: string;
};

interface D1Meta {
  last_row_id?: number;
  changes?: number;
}

interface D1PreparedStatement {
  bind(...values: (string | number | null)[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  run(): Promise<{ success: boolean; meta: D1Meta; results: Record<string, unknown>[] }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

type Env = { Bindings: Bindings };

const PAGE_SIZE = 20;
const NAME_MAX = 20;
const CONTENT_MAX = 500;
const PASSWORD_MIN = 4;
const PASSWORD_MAX = 64;
const RATE_LIMIT_WINDOW_MIN = 5;
const RATE_LIMIT_MAX = 5;
const ADMIN_ATTEMPT_WINDOW_MIN = 15;
const ADMIN_ATTEMPT_MAX = 10;
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

const app = new Hono<Env>();

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(password),
  );
  return hex(digest);
}

async function adminHmac(adminPassword: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(adminPassword),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return hex(sig);
}

async function issueAdminToken(adminPassword: string): Promise<string> {
  const exp = Date.now() + TOKEN_TTL_MS;
  const sig = await adminHmac(adminPassword, `admin:${exp}`);
  return `${exp}.${sig}`;
}

async function verifyAdminToken(adminPassword: string, token: string): Promise<boolean> {
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = await adminHmac(adminPassword, `admin:${exp}`);
  return token.slice(dot + 1) === expected;
}

async function checkIpBanned(db: D1Database, ip: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 AS ok FROM banned WHERE ip = ?1")
    .bind(ip)
    .first();
  return row !== null;
}

app.post("/api/admin/login", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";

  const attempts = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n
       FROM admin_attempts
      WHERE ip = ?1
        AND created_at > datetime('now', ${`'-${ADMIN_ATTEMPT_WINDOW_MIN} minutes'`})`,
  )
    .bind(ip)
    .first<{ n: number }>();
  if ((attempts?.n ?? 0) >= ADMIN_ATTEMPT_MAX) {
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

  return c.json({ token: await issueAdminToken(c.env.ADMIN_PASSWORD) });
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

  const totalRow = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM messages")
    .first<{ n: number }>();
  const total = totalRow?.n ?? 0;
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const result = await c.env.DB.prepare(
    `SELECT id, name, content, ip, created_at
       FROM messages
      ORDER BY created_at DESC, id DESC
      LIMIT ?1 OFFSET ?2`,
  )
    .bind(PAGE_SIZE, (page - 1) * PAGE_SIZE)
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

  const totalRow = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM messages")
    .first<{ n: number }>();
  const total = totalRow?.n ?? 0;
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const items = await c.env.DB.prepare(
    `SELECT id, name, content, created_at
       FROM messages
      ORDER BY created_at DESC, id DESC
      LIMIT ?1 OFFSET ?2`,
  )
    .bind(PAGE_SIZE, (page - 1) * PAGE_SIZE)
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

  if (!name || name.length > NAME_MAX) {
    return c.json({ error: `name must be 1-${NAME_MAX} chars` }, 400);
  }
  if (!content || content.length > CONTENT_MAX) {
    return c.json({ error: `content must be 1-${CONTENT_MAX} chars` }, 400);
  }
  if (
    password.length < PASSWORD_MIN ||
    password.length > PASSWORD_MAX
  ) {
    return c.json(
      { error: `password must be ${PASSWORD_MIN}-${PASSWORD_MAX} chars` },
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
        AND created_at > datetime('now', ${`'-${RATE_LIMIT_WINDOW_MIN} minutes'`})`,
  )
    .bind(ip)
    .first<{ n: number }>();
  if ((rate?.n ?? 0) >= RATE_LIMIT_MAX) {
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

export default app;

/**
 * End-to-end tests against the Hono app with an in-memory D1 mock.
 * Mirrors the public test suite (13 checks) and admin test suite of the
 * original project, plus option-tuning coverage.
 *
 * @module
 */

import { assert, assertEquals } from "@std/assert";
import { createGuestbookApp } from "../src/app.ts";
import { SCHEMA_SQL } from "../src/schema.ts";
import { MockD1 } from "./mock_d1.ts";

const ADMIN_PASSWORD = "admin-secret";

function makeApp(options?: Parameters<typeof createGuestbookApp>[0]) {
  const db = new MockD1();
  const app = createGuestbookApp(options);
  const request = async (
    path: string,
    init?: RequestInit,
    ip = "203.0.113.9",
  ): Promise<Response> =>
    await app.request(path, {
      ...init,
      headers: { ...(init?.headers ?? {}), "cf-connecting-ip": ip },
    }, { DB: db, ADMIN_PASSWORD: ADMIN_PASSWORD });
  return { app, db, request };
}

function post(
  request: ReturnType<typeof makeApp>["request"],
  body: unknown,
  ip?: string,
) {
  return request("/api/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, ip);
}

Deno.test("public: list is empty initially", async () => {
  const { request } = makeApp();
  const res = await request("/api/messages");
  assertEquals(res.status, 200);
  assertEquals(await res.json(), {
    items: [],
    page: 1,
    maxPage: 1,
    total: 0,
  });
});

Deno.test("public: create message returns 201 with id", async () => {
  const { request, db } = makeApp();
  const res = await post(request, {
    name: "阿明",
    content: "這裡真好逛！",
    password: "1234",
  });
  assertEquals(res.status, 201);
  const { id } = await res.json();
  assertEquals(id, 1);
  assertEquals(db.messages.length, 1);
  // password is stored hashed, never in plain text
  assert(db.messages[0].password !== "1234");
});

Deno.test("public: field validation rejects bad input", async () => {
  const { request } = makeApp();
  for (
    const body of [
      { content: "hi", password: "1234" },
      { name: "x".repeat(21), content: "hi", password: "1234" },
      { name: "a", content: "", password: "1234" },
      { name: "a", content: "c".repeat(501), password: "1234" },
      { name: "a", content: "hi", password: "123" },
      { name: "a", content: "hi", password: "6".repeat(65) },
    ]
  ) {
    const res = await post(request, body);
    assertEquals(res.status, 400);
  }
  const badBody = await request("/api/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not json",
  });
  assertEquals(badBody.status, 400);
});

Deno.test("public: rate limit blocks the 6th message in the window", async () => {
  const { request } = makeApp();
  const ip = "198.51.100.7";
  for (let i = 0; i < 5; i++) {
    const res = await post(request, {
      name: `user${i}`,
      content: "hello",
      password: "1234",
    }, ip);
    assertEquals(res.status, 201);
  }
  const res = await post(request, {
    name: "user6",
    content: "hello",
    password: "1234",
  }, ip);
  assertEquals(res.status, 429);
});

Deno.test("public: delete with wrong password fails, right password succeeds", async () => {
  const { request } = makeApp();
  const { id } = await (await post(request, {
    name: "a",
    content: "hi",
    password: "1234",
  })).json();

  const wrong = await request(`/api/messages/${id}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "9999" }),
  });
  assertEquals(wrong.status, 403);

  const right = await request(`/api/messages/${id}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "1234" }),
  });
  assertEquals(right.status, 204);
});

Deno.test("public: delete errors for missing id or malformed request", async () => {
  const { request } = makeApp();
  const missing = await request("/api/messages/999", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "1234" }),
  });
  assertEquals(missing.status, 404);

  const malformed = await request("/api/messages/1", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assertEquals(malformed.status, 400);
});

Deno.test("public: banned IP cannot post", async () => {
  const { request, db } = makeApp();
  db.banned.set("203.0.113.9", {
    reason: "spam",
    created_at: "2026-01-01 00:00:00",
  });
  const res = await post(request, {
    name: "a",
    content: "hi",
    password: "1234",
  });
  assertEquals(res.status, 403);
});

Deno.test("public: pagination and stable ids after deletion", async () => {
  const { request } = makeApp({ pageSize: 10 });
  for (let i = 0; i < 12; i++) {
    await post(
      request,
      { name: `u${i}`, content: "c", password: "1234" },
      `10.0.0.${i}`,
    );
  }
  const page1 = await (await request("/api/messages?page=1")).json();
  assertEquals(page1.total, 12);
  assertEquals(page1.maxPage, 2);
  assertEquals(page1.items.length, 10);
  assertEquals(page1.items[0].name, "u11"); // newest first

  // deleted ids are never reused
  await request("/api/messages/12", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "1234" }),
  });
  const created = await post(request, {
    name: "new",
    content: "c",
    password: "1234",
  }, "10.0.0.99");
  assertEquals((await created.json()).id, 13);
});

Deno.test("admin: login issues token, wrong password is rejected", async () => {
  const { request } = makeApp();
  const bad = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "nope" }),
  });
  assertEquals(bad.status, 401);

  const good = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  assertEquals(good.status, 200);
  assert(((await good.json()) as { token: string }).token.includes("."));
});

Deno.test("admin: admin endpoints require a valid bearer token", async () => {
  const { request } = makeApp();
  const noToken = await request("/api/admin/messages");
  assertEquals(noToken.status, 401);

  const badToken = await request("/api/admin/messages", {
    headers: { authorization: "Bearer tampered.token" },
  });
  assertEquals(badToken.status, 401);

  const login = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  const { token } = await login.json();

  const ok = await request("/api/admin/messages", {
    headers: { authorization: `Bearer ${token}` },
  });
  assertEquals(ok.status, 200);
});

Deno.test("admin: list includes IP and can delete without password", async () => {
  const { request } = makeApp();
  const { id } = await (await post(request, {
    name: "a",
    content: "hi",
    password: "1234",
  })).json();

  const login = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  const { token } = await login.json();
  const auth = { headers: { authorization: `Bearer ${token}` } };

  const list = await (await request("/api/admin/messages", auth)).json();
  assertEquals(list.items[0].ip, "203.0.113.9");

  const del = await request(`/api/admin/messages/${id}`, {
    method: "DELETE",
    ...auth,
  });
  assertEquals(del.status, 204);

  const delAgain = await request(`/api/admin/messages/${id}`, {
    method: "DELETE",
    ...auth,
  });
  assertEquals(delAgain.status, 404);

  const invalid = await request("/api/admin/messages/abc", {
    method: "DELETE",
    ...auth,
  });
  assertEquals(invalid.status, 400);
});

Deno.test("admin: ban and unban work end to end", async () => {
  const { request } = makeApp();
  const login = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  const { token } = await login.json();
  const auth = { headers: { authorization: `Bearer ${token}` } };

  const ban = await request("/api/admin/ban", {
    method: "POST",
    headers: { "content-type": "application/json", ...auth.headers },
    body: JSON.stringify({ ip: "203.0.113.9", reason: "spam" }),
  });
  assertEquals(ban.status, 201);

  const list = await (await request("/api/admin/banned", auth)).json();
  assertEquals(list.items[0].ip, "203.0.113.9");
  assertEquals(list.items[0].reason, "spam");

  const unban = await request("/api/admin/ban/203.0.113.9", {
    method: "DELETE",
    ...auth,
  });
  assertEquals(unban.status, 204);

  const unbanAgain = await request("/api/admin/ban/203.0.113.9", {
    method: "DELETE",
    ...auth,
  });
  assertEquals(unbanAgain.status, 404);
});

Deno.test("admin: repeated login failures lock the IP", async () => {
  const { request } = makeApp({
    adminAttemptMax: 3,
    adminAttemptWindowMinutes: 10,
  });
  const login = () =>
    request("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
  assertEquals((await login()).status, 401);
  assertEquals((await login()).status, 401);
  assertEquals((await login()).status, 401);
  const locked = await login();
  assertEquals(locked.status, 429);

  // even the correct password is locked out now
  const good = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  assertEquals(good.status, 429);
});

Deno.test("admin: token from a different admin password is rejected", async () => {
  const { request } = makeApp();
  const login = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  const { token } = await login.json();

  // rotate the admin password: old tokens must stop working
  const rotated = createGuestbookApp();
  const res = await rotated.request("/api/admin/messages", {
    headers: { authorization: `Bearer ${token}` },
  }, { DB: new MockD1(), ADMIN_PASSWORD: "new-secret" });
  assertEquals(res.status, 401);
});

Deno.test("schema: SCHEMA_SQL matches the shipped schema.sql", async () => {
  const sql = await Deno.readTextFile(
    new URL("../schema.sql", import.meta.url),
  );
  assertEquals(SCHEMA_SQL.trim(), sql.trim());
});

import { assert, assertEquals, assertNotEquals } from "@std/assert";
import {
  changePassword,
  invalidateUserTokens,
  login,
  pruneSessions,
  resetKeyCache,
  resolveSession,
  revokeSession,
} from "../lib/auth.ts";
import { getDb } from "../lib/db.ts";
import { checkRateLimit, resetRateLimits } from "../lib/rate-limit.ts";
import {
  createUser,
  listUsers,
  resetUserPassword,
  setUserActive,
} from "../lib/users.ts";
import { freshDb, seedMinimal } from "./helpers.ts";

const META = { ip: "127.0.0.1", userAgent: "test" };

Deno.test("登入成功會發出可驗證的 token", async () => {
  const db = freshDb();
  seedMinimal(db);

  const result = await login("admin", "admin", META);
  assert(result.ok);

  const resolved = await resolveSession(result.token);
  assert(resolved !== null);
  assertEquals(resolved.user.username, "admin");
  assertEquals(resolved.user.role, "admin");
  assertEquals(resolved.user.studentId, null);
});

Deno.test("密碼錯誤或帳號不存在都不能登入", async () => {
  const db = freshDb();
  seedMinimal(db);

  assertEquals((await login("admin", "wrong", META)).ok, false);
  assertEquals((await login("nobody", "admin", META)).ok, false);
  assertEquals((await login("", "", META)).ok, false);
});

Deno.test("token 遭竄改就驗證失敗", async () => {
  const db = freshDb();
  seedMinimal(db);
  const result = await login("admin", "admin", META);
  assert(result.ok);

  assertEquals(await resolveSession(result.token + "x"), null);
  assertEquals(await resolveSession("not.a.jwt"), null);
  assertEquals(await resolveSession(""), null);
});

Deno.test("登出（撤銷 session）後 token 立即失效", async () => {
  const db = freshDb();
  seedMinimal(db);
  const result = await login("admin", "admin", META);
  assert(result.ok);

  const resolved = await resolveSession(result.token);
  assert(resolved !== null);
  revokeSession(resolved.sid);

  assertEquals(await resolveSession(result.token), null);
});

Deno.test("改密碼會讓所有既有 token 失效", async () => {
  const db = freshDb();
  seedMinimal(db);

  const first = await login("admin", "admin", META);
  assert(first.ok);
  assert((await resolveSession(first.token)) !== null);

  changePassword(first.user.id, first.user.id, "new-password");

  assertEquals(await resolveSession(first.token), null);
  // 舊密碼登不進去，新密碼可以
  assertEquals((await login("admin", "admin", META)).ok, false);
  assert((await login("admin", "new-password", META)).ok);
});

Deno.test("停用帳號後無法登入，既有 token 也失效", async () => {
  const db = freshDb();
  const ids = seedMinimal(db);

  const teacherLogin = await login("t1", "t1", META);
  assert(teacherLogin.ok);
  assert((await resolveSession(teacherLogin.token)) !== null);

  const result = setUserActive(ids.adminUserId, teacherLogin.user.id, false);
  assert(result.ok);

  assertEquals((await login("t1", "t1", META)).ok, false);
  assertEquals(await resolveSession(teacherLogin.token), null);
});

Deno.test("停用會一併關掉附屬的教師/學生資料", () => {
  const db = freshDb();
  const ids = seedMinimal(db);
  const studentUser = db.prepare(
    "SELECT user_id FROM students WHERE id = ?",
  ).get(ids.studentId) as { user_id: number };

  assert(setUserActive(ids.adminUserId, studentUser.user_id, false).ok);

  const student = db.prepare("SELECT is_active FROM students WHERE id = ?")
    .get(ids.studentId) as { is_active: number };
  assertEquals(student.is_active, 0);
});

Deno.test("不能停用自己的帳號", () => {
  const db = freshDb();
  const ids = seedMinimal(db);

  const result = setUserActive(ids.adminUserId, ids.adminUserId, false);
  assertEquals(result.ok, false);
  if (!result.ok) assert(result.error.includes("自己"));
});

Deno.test("roles 不對的 JWT 權限Payload 無法偽造登入", async () => {
  const db = freshDb();
  seedMinimal(db);

  // 拿學生的 token 試著把 role 改掉 —— 簽章不符就會被擋掉
  const student = await login("s1", "s1", META);
  assert(student.ok);

  const [header, , signature] = student.token.split(".");
  const forgedPayload = btoa(JSON.stringify({
    sub: String(student.user.id),
    sid: "x",
    ver: 0,
    exp: Math.floor(Date.now() / 1000) + 3600,
    role: "admin",
  })).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

  assertEquals(
    await resolveSession(`${header}.${forgedPayload}.${signature}`),
    null,
  );
});

Deno.test("token_version 不符時 session 失效（異動角色/權限的情境）", async () => {
  const db = freshDb();
  seedMinimal(db);
  const result = await login("t1", "t1", META);
  assert(result.ok);

  invalidateUserTokens(result.user.id);
  assertEquals(await resolveSession(result.token), null);
});

Deno.test("rate limit 在超過次數後封鎖，過期自動恢復", async () => {
  resetRateLimits();

  for (let i = 0; i < 5; i++) {
    assertEquals(
      checkRateLimit("ip-a", 5, 60_000).allowed,
      true,
      `第 ${i + 1} 次`,
    );
  }
  const blocked = checkRateLimit("ip-a", 5, 60_000);
  assertEquals(blocked.allowed, false);
  assert(blocked.retryAfterSeconds > 0);

  // 換一個 IP 不受影響
  assertEquals(checkRateLimit("ip-b", 5, 60_000).allowed, true);

  // 視窗過期後恢復。要用獨立的 key：同一個 key 只會沿用原本建立的視窗
  assertEquals(checkRateLimit("ip-c", 2, 1).allowed, true);
  assertEquals(checkRateLimit("ip-c", 2, 1).allowed, true);
  assertEquals(checkRateLimit("ip-c", 2, 1).allowed, false);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assertEquals(checkRateLimit("ip-c", 2, 1).allowed, true);

  resetRateLimits();
});

Deno.test("建立帳號會連帶建立對應的教師/學生資料", () => {
  const db = freshDb();
  const ids = seedMinimal(db);

  const student = createUser(ids.adminUserId, {
    username: "s2",
    name: "小芳",
    role: "student",
    studentNo: "11024099",
  });
  assert(student.ok);

  const row = db.prepare(
    `SELECT s.student_no, u.role FROM students s
       JOIN users u ON u.id = s.user_id WHERE s.user_id = ?`,
  ).get(student.userId) as { student_no: string; role: string };
  assertEquals(row.student_no, "11024099");
  assertEquals(row.role, "student");

  const teacher = createUser(ids.adminUserId, {
    username: "t9",
    name: "新老師",
    role: "teacher",
  });
  assert(teacher.ok);
  const teacherCount = db.prepare(
    "SELECT COUNT(*) AS n FROM teachers WHERE user_id = ?",
  ).get(teacher.userId) as { n: number };
  assertEquals(teacherCount.n, 1);
});

Deno.test("建立學生帳號沒給學號會被擋下", () => {
  const db = freshDb();
  const ids = seedMinimal(db);

  const result = createUser(ids.adminUserId, {
    username: "s3",
    name: "沒學號",
    role: "student",
  });
  assertEquals(result.ok, false);
});

Deno.test("重複帳號或學號會被擋下且不會留下半筆資料", () => {
  const db = freshDb();
  const ids = seedMinimal(db);

  const dupUser = createUser(ids.adminUserId, {
    username: "t1",
    name: "重複",
    role: "teacher",
  });
  assertEquals(dupUser.ok, false);

  const dupNo = createUser(ids.adminUserId, {
    username: "s9",
    name: "學號重複",
    role: "student",
    studentNo: "11024001",
  });
  assertEquals(dupNo.ok, false);

  // 失敗的建帳不應該留下孤兒的 users 列
  const orphan = db.prepare(
    "SELECT COUNT(*) AS n FROM users WHERE username IN ('t1', 's9') AND deleted_at IS NULL",
  ).get() as { n: number };
  assertEquals(orphan.n, 1); // 只剩原本那位李老師
});

Deno.test("admin 重設密碼後舊密碼失效", () => {
  const db = freshDb();
  const ids = seedMinimal(db);

  const target = db.prepare("SELECT id FROM users WHERE username = 't1'")
    .get() as { id: number };

  assert(resetUserPassword(ids.adminUserId, target.id, "brand-new").ok);
  assertEquals(resetUserPassword(ids.adminUserId, target.id, "").ok, false);

  // 密碼本身不該出現在稽核記錄裡
  const audit = db.prepare(
    "SELECT detail FROM audit_logs WHERE action = 'password_reset'",
  ).all() as { detail: string }[];
  assertEquals(audit.length, 1);
  assert(!audit[0].detail.includes("brand-new"));
});

Deno.test("登入成功與失敗都會寫入稽核記錄", async () => {
  const db = freshDb();
  seedMinimal(db);

  await login("admin", "admin", META);
  await login("admin", "bad", META);

  const rows = db.prepare(
    "SELECT action FROM audit_logs WHERE action LIKE 'login%' ORDER BY id",
  ).all() as { action: string }[];
  assertEquals(rows.map((r) => r.action), ["login", "login_failed"]);
});

Deno.test("session 到期或撤銷後可以被清除", async () => {
  const db = freshDb();
  seedMinimal(db);

  const a = await login("admin", "admin", META);
  const b = await login("admin", "admin", META);
  assert(a.ok && b.ok);
  revokeSession((await resolveSession(b.token))!.sid);

  assertEquals(pruneSessions(), 1);

  const remaining = db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as {
    n: number;
  };
  assertEquals(remaining.n, 1);
});

Deno.test("session 資料庫只存 token 的雜湊，不存明文", async () => {
  const db = freshDb();
  seedMinimal(db);
  const result = await login("admin", "admin", META);
  assert(result.ok);

  const rows = db.prepare("SELECT id FROM sessions").all() as { id: string }[];
  assertEquals(rows.length, 1);
  assertNotEquals(rows[0].id, result.token);
  assert(/^[0-9a-f]{64}$/.test(rows[0].id));
});

Deno.test("listUsers 預設不顯示已刪除的帳號", () => {
  const db = freshDb();
  const ids = seedMinimal(db);
  const target = db.prepare("SELECT id FROM users WHERE username = 't2'")
    .get() as { id: number };

  assertEquals(listUsers().length, 4);
  setUserActive(ids.adminUserId, target.id, false);
  assertEquals(listUsers().length, 3);
  assertEquals(listUsers(true).length, 4);
});

Deno.test("更換 JWT_SECRET 後所有舊 token 立即失效", async () => {
  const db = freshDb();
  seedMinimal(db);

  const result = await login("admin", "admin", META);
  assert(result.ok);
  assert((await resolveSession(result.token)) !== null);

  Deno.env.set("JWT_SECRET", "a-completely-different-secret-key-0123456789");
  resetKeyCache();

  // 簽章對不上，session 還在資料庫裡也沒用
  assertEquals(await resolveSession(result.token), null);
  assertEquals(
    (getDb().prepare("SELECT COUNT(*) AS n FROM sessions").get() as {
      n: number;
    })
      .n,
    1,
  );

  Deno.env.delete("JWT_SECRET");
  resetKeyCache();
});

Deno.test("resolveSession 對未知角色的帳號拒絕登入", async () => {
  const db = freshDb();
  seedMinimal(db);

  const result = await login("admin", "admin", META);
  assert(result.ok);
  // 直接改掉 roles enum 之外的值，模擬資料被手動竄改。
  // 這時既不能讓它登入（回傳 null），也不能讓整個 login API 丟 500。
  db.prepare("UPDATE users SET role = 'wizard' WHERE id = ?").run(
    result.user.id,
  );

  assertEquals(await resolveSession(result.token), null);
  assertEquals((await login("admin", "admin", META)).ok, false);

  const rejected = db.prepare(
    "SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'login_rejected_invalid_role'",
  ).get() as { n: number };
  assertEquals(rejected.n, 1);
});

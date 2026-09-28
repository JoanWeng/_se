import {
  assert,
  assertEquals,
  assertNotEquals,
  assertThrows,
} from "@std/assert";
import { runMigrations } from "../lib/migrate.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import { can, isRole } from "../lib/roles.ts";
import { freshDb, seedMinimal } from "./helpers.ts";

Deno.test("migration 可重複執行且具冪等性", () => {
  const db = freshDb();
  const before = db.prepare("SELECT COUNT(*) AS n FROM schema_migrations")
    .get();
  assertEquals(before?.n, 1);

  const executed = runMigrations(db);
  assertEquals(executed, []);

  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all().map((r) => r.name);

  assertEquals(tables, [
    "announcement_reads",
    "announcements",
    "audit_logs",
    "classes",
    "courses",
    "enrollments",
    "grades",
    "schema_migrations",
    "semesters",
    "sessions",
    "students",
    "teachers",
    "users",
  ]);
});

Deno.test("foreign key 真的有開啟", () => {
  const db = freshDb();
  const ids = seedMinimal(db);

  assertThrows(
    () =>
      db.prepare(
        `INSERT INTO courses (name, teacher_id, class_id, semester_id)
         VALUES (?, ?, ?, ?)`,
      ).run("不存在的課程", 9999, ids.classId, ids.semesterId),
    Error,
    "FOREIGN KEY",
  );
});

Deno.test("軟刪除後 username 與 email 可以重用", () => {
  const db = freshDb();
  seedMinimal(db);

  db.prepare("UPDATE users SET deleted_at = ? WHERE username = 't1'").run(
    new Date().toISOString(),
  );

  const row = db.prepare(
    "INSERT INTO users (username, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)",
  ).run("t1", "新李老師", null, hashPassword("x"), "teacher");

  assertNotEquals(row.lastInsertRowid, undefined);
});

Deno.test("未刪除的 username 仍然不可重複", () => {
  const db = freshDb();
  seedMinimal(db);

  assertThrows(
    () =>
      db.prepare(
        "INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)",
      ).run("t1", "重複", hashPassword("x"), "teacher"),
    Error,
    "UNIQUE",
  );
});

Deno.test("email 為 NULL 的多筆不會互相衝突", () => {
  const db = freshDb();
  seedMinimal(db);

  for (let i = 0; i < 3; i++) {
    db.prepare(
      "INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)",
    ).run(`noemail${i}`, `無email${i}`, hashPassword("x"), "student");
  }

  // seedMinimal 建的 4 個帳號 email 都是 NULL，加上這裡 3 個 = 7
  const count = db.prepare(
    "SELECT COUNT(*) AS n FROM users WHERE email IS NULL",
  ).get();
  assertEquals(count?.n, 7);
});

Deno.test("同時只能有一個目前學期", () => {
  const db = freshDb();
  const ids = seedMinimal(db);

  assertThrows(
    () =>
      db.prepare(
        `INSERT INTO semesters (name, is_current, start_date, end_date)
         VALUES (?, 1, ?, ?)`,
      ).run("第二個目前學期", "2027-02-01", "2027-07-31"),
    Error,
    "UNIQUE",
  );

  // 切換學期應該是 transaction：先取消舊的再設新的
  db.exec("BEGIN");
  db.prepare("UPDATE semesters SET is_current = 0 WHERE is_current = 1").run();
  db.prepare("UPDATE semesters SET is_current = 1 WHERE id = ?").run(
    ids.semesterId,
  );
  db.exec("COMMIT");

  const current = db.prepare(
    "SELECT id FROM semesters WHERE is_current = 1",
  ).all();
  assertEquals(current.length, 1);
  assertEquals(current[0].id, ids.semesterId);
});

Deno.test("成績唯一鍵擋掉重複登錄，但可以更新", () => {
  const db = freshDb();
  const ids = seedMinimal(db);

  const insert = db.prepare(
    `INSERT INTO grades (student_id, course_id, semester_id, score)
     VALUES (?, ?, ?, ?)`,
  );
  insert.run(ids.studentId, ids.courseId, ids.semesterId, 80);

  assertThrows(
    () => insert.run(ids.studentId, ids.courseId, ids.semesterId, 90),
    Error,
    "UNIQUE",
  );

  const updated = db.prepare(
    `UPDATE grades SET score = ? WHERE student_id = ? AND course_id = ?`,
  ).run(95, ids.studentId, ids.courseId);
  assertEquals(updated.changes, 1);
});

Deno.test("成績分數超出 0-100 會被 CHECK 擋下", () => {
  const db = freshDb();
  const ids = seedMinimal(db);

  assertThrows(
    () =>
      db.prepare(
        `INSERT INTO grades (student_id, course_id, semester_id, score)
         VALUES (?, ?, ?, ?)`,
      ).run(ids.studentId, ids.courseId, ids.semesterId, 120),
    Error,
    "CHECK",
  );

  // score 為 NULL 代表尚未登錄，應該允許
  db.prepare(
    `INSERT INTO grades (student_id, course_id, semester_id, score)
     VALUES (?, ?, ?, NULL)`,
  ).run(ids.studentId, ids.courseId, ids.semesterId);
});

Deno.test("bcrypt 雜湊可驗證且不存明文", () => {
  const db = freshDb();
  seedMinimal(db);

  const row = db.prepare(
    "SELECT password_hash FROM users WHERE username = 'admin'",
  ).get() as { password_hash: string };

  assert(!row.password_hash.includes("admin"));
  assert(row.password_hash.startsWith("$2"));
  assert(verifyPassword("admin", row.password_hash));
  assert(!verifyPassword("admin2", row.password_hash));
  assert(!verifyPassword("admin", "not-a-valid-hash"));
});

Deno.test("角色驗證與權限矩陣", () => {
  assert(isRole("admin"));
  assert(isRole("student"));
  assert(!isRole("root"));
  assert(!isRole(null));
  assert(!isRole("ADMIN"));

  assert(can("admin", "students:write"));
  assert(!can("student", "students:write"));
  assert(can("teacher", "grades:write:own_course"));
  assert(!can("teacher", "semesters:write"));
});

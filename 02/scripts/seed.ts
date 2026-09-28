/**
 * Seed script：建立測試帳號與範例班級/課程/成績/公告資料。
 *
 *   deno task db:seed          # 已存在資料時會跳過
 *   deno task db:reset         # 刪掉資料庫檔案後重建
 *
 * 測試帳號密碼一律等於帳號名稱（admin/admin），僅供開發與展示使用。
 */
import { dirname } from "@std/path";
import { hashPassword } from "../lib/password.ts";
import { getAppEnv, resolveDbPath } from "../lib/env.ts";
import { getDb, getDbPath } from "../lib/db.ts";

const RESET = Deno.args.includes("--reset");

function removeDbFiles(path: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      Deno.removeSync(path + suffix);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
}

if (RESET) {
  // 必須在 getDb() 之前刪，getDb() 是 lazy 的所以這裡順序沒問題
  const path = resolveDbPath();
  if (path === ":memory:") {
    throw new Error("DB_PATH 是 :memory:，沒有檔案可以刪除");
  }
  removeDbFiles(path);
  Deno.mkdirSync(dirname(path), { recursive: true });
  console.log(`已刪除舊資料庫：${path}`);
}

const db = getDb();

const existing = db.prepare("SELECT id FROM users LIMIT 1").get();
if (existing !== undefined && !RESET) {
  console.log("資料庫已有資料，略過 seed。要重建請執行：deno task db:reset");
  Deno.exit(0);
}

const now = new Date().toISOString();

function insertUser(
  username: string,
  name: string,
  role: string,
  email: string | null,
): number {
  const result = db.prepare(
    `INSERT INTO users (username, name, email, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(username, name, email, hashPassword(username), role, now);
  return Number(result.lastInsertRowid);
}

db.exec("BEGIN");
try {
  // ------------------------------------------------------------ 學期
  const insertSemester = db.prepare(
    `INSERT INTO semesters (name, is_current, start_date, end_date)
     VALUES (?, ?, ?, ?)`,
  );
  insertSemester.run("113學年度第2學期", 0, "2026-02-23", "2026-07-31");
  const currentSemesterId = Number(
    insertSemester.run(
      "114學年度第1學期",
      1,
      "2026-09-01",
      "2027-01-31",
    ).lastInsertRowid,
  );

  // ------------------------------------------------------------ 帳號
  const adminUserId = insertUser(
    "admin",
    "王行政",
    "admin",
    "admin@example.edu.tw",
  );
  const teacher1UserId = insertUser(
    "teacher1",
    "李國文",
    "teacher",
    "teacher1@example.edu.tw",
  );

  const teacherIds: number[] = [];
  const insertTeacher = db.prepare(
    "INSERT INTO teachers (user_id, phone) VALUES (?, ?)",
  );
  teacherIds.push(
    Number(insertTeacher.run(teacher1UserId, "02-2345-1001").lastInsertRowid),
  );
  {
    const userId = insertUser(
      "teacher2",
      "陳美玲",
      "teacher",
      "teacher2@example.edu.tw",
    );
    teacherIds.push(
      Number(insertTeacher.run(userId, "02-2345-1002").lastInsertRowid),
    );
  }

  const insertStudent = db.prepare(
    `INSERT INTO students (user_id, student_no, birth_date, phone, emergency_contact, class_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  // ------------------------------------------------------------ 班級
  const insertClass = db.prepare(
    "INSERT INTO classes (name, year, homeroom_teacher_id) VALUES (?, ?, ?)",
  );
  const classA = Number(
    insertClass.run("資工一甲", "114", teacherIds[0]).lastInsertRowid,
  );
  const classB = Number(
    insertClass.run("資工一乙", "114", teacherIds[1]).lastInsertRowid,
  );

  const students: { id: number; classId: number }[] = [];
  for (
    const [i, classId] of [classA, classA, classA, classB, classB, classB]
      .entries()
  ) {
    const no = `11024${String(i + 1).padStart(3, "0")}`;
    const userId = insertUser(
      `student${i + 1}`,
      `學生${i + 1}`,
      "student",
      `${no}@example.edu.tw`,
    );
    const id = Number(
      insertStudent.run(
        userId,
        no,
        `2007-0${(i % 9) + 1}-15`,
        "0912-345-678",
        `家長${i + 1} 0912-000-00${i + 1}`,
        classId,
      ).lastInsertRowid,
    );
    students.push({ id, classId });
  }

  // ------------------------------------------------------------ 課程
  const insertCourse = db.prepare(
    `INSERT INTO courses (name, teacher_id, class_id, schedule, semester_id)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const courseProg = Number(
    insertCourse.run(
      "程式設計",
      teacherIds[0],
      classA,
      "週一 3-4 節",
      currentSemesterId,
    ).lastInsertRowid,
  );
  const courseDb = Number(
    insertCourse.run(
      "資料庫概論",
      teacherIds[0],
      classA,
      "週三 5-6 節",
      currentSemesterId,
    ).lastInsertRowid,
  );
  const courseProgB = Number(
    insertCourse.run(
      "物件導向程式設計",
      teacherIds[1],
      classB,
      "週二 7-8 節",
      currentSemesterId,
    ).lastInsertRowid,
  );

  // ------------------------------------------------------------ 選課
  const insertEnroll = db.prepare(
    "INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)",
  );
  for (const s of students) {
    insertEnroll.run(s.id, s.classId === classA ? courseProg : courseProgB);
  }
  for (const s of students.filter((s) => s.classId === classA)) {
    insertEnroll.run(s.id, courseDb);
  }

  // ------------------------------------------------------------ 成績
  const insertGrade = db.prepare(
    `INSERT INTO grades (student_id, course_id, semester_id, score, comment, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const scores = [88, 92, 76, 95, 81, 68];
  for (const [index, s] of students.entries()) {
    const c = s.classId === classA ? courseProg : courseProgB;
    insertGrade.run(
      s.id,
      c,
      currentSemesterId,
      scores[index],
      index % 3 === 0 ? "期末複習進步明顯" : null,
      now,
    );
  }
  // 資工一甲前兩位學生另有資料庫概論成績
  for (
    const [index, s] of students.filter((s) => s.classId === classA)
      .slice(0, 2)
      .entries()
  ) {
    insertGrade.run(
      s.id,
      courseDb,
      currentSemesterId,
      85 + index,
      null,
      now,
    );
  }

  // ------------------------------------------------------------ 公告
  const insertAnnouncement = db.prepare(
    `INSERT INTO announcements (title, content, target_class_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  insertAnnouncement.run(
    "114學年度第1學期選課須知",
    "請同學於開學前完成選課確認，選課截止日為 9 月 15 日。",
    null,
    adminUserId,
    now,
  );
  insertAnnouncement.run(
    "期中考範圍公告",
    "期中考範圍為第 1 至 6 章，請同學複習。",
    classA,
    teacher1UserId,
    now,
  );

  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

console.log(`資料庫：${getDbPath()}（APP_ENV=${getAppEnv()}）`);
console.log("Seed 完成，測試帳號（帳號 = 密碼）：");
console.log("  admin    / admin      行政人員");
console.log("  teacher1 / teacher1   教師（資工一甲導師）");
console.log("  teacher2 / teacher2   教師（資工一乙導師）");
console.log("  student1 / student1   學生（資工一甲）");
console.log("  ... student6 / student6");

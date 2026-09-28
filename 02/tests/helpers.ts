/**
 * 測試用資料庫helper。
 *
 * 每個測試都拿到全新的一份 :memory: 資料庫（schema 由 migration 重新建），
 * 絕不會碰到開發/正式資料。
 */
import type { DatabaseSync } from "node:sqlite";
import { closeDb, getDb } from "../lib/db.ts";
import { hashPassword } from "../lib/password.ts";

export function freshDb(): DatabaseSync {
  Deno.env.set("DB_PATH", ":memory:");
  closeDb();
  return getDb();
}

export interface SeededIds {
  adminUserId: number;
  teacherId: number;
  otherTeacherId: number;
  studentId: number;
  classId: number;
  semesterId: number;
  courseId: number;
}

/** 建一組最小可用資料，回傳各表 id 供測試使用 */
export function seedMinimal(db: DatabaseSync): SeededIds {
  const now = new Date().toISOString();
  const insertUser = db.prepare(
    `INSERT INTO users (username, name, email, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertTeacher = db.prepare(
    "INSERT INTO teachers (user_id, phone) VALUES (?, ?)",
  );
  const insertStudent = db.prepare(
    "INSERT INTO students (user_id, student_no, class_id) VALUES (?, ?, ?)",
  );

  const adminUserId = Number(
    insertUser.run("admin", "管理員", null, hashPassword("admin"), "admin", now)
      .lastInsertRowid,
  );
  const teacherId = Number(
    insertTeacher.run(
      Number(
        insertUser.run(
          "t1",
          "李老師",
          null,
          hashPassword("t1"),
          "teacher",
          now,
        ).lastInsertRowid,
      ),
      "02-0000000",
    ).lastInsertRowid,
  );
  const otherTeacherId = Number(
    insertTeacher.run(
      Number(
        insertUser.run(
          "t2",
          "陳老師",
          null,
          hashPassword("t2"),
          "teacher",
          now,
        ).lastInsertRowid,
      ),
      "02-0000001",
    ).lastInsertRowid,
  );

  const semesterId = Number(
    db.prepare(
      `INSERT INTO semesters (name, is_current, start_date, end_date)
       VALUES (?, 1, ?, ?)`,
    ).run("114-1", "2026-09-01", "2027-01-31").lastInsertRowid,
  );

  const classId = Number(
    db.prepare(
      "INSERT INTO classes (name, year, homeroom_teacher_id) VALUES (?, ?, ?)",
    ).run("一甲", "114", teacherId).lastInsertRowid,
  );

  const studentId = Number(
    insertStudent.run(
      Number(
        insertUser.run(
          "s1",
          "小明",
          null,
          hashPassword("s1"),
          "student",
          now,
        ).lastInsertRowid,
      ),
      "11024001",
      classId,
    ).lastInsertRowid,
  );

  const courseId = Number(
    db.prepare(
      `INSERT INTO courses (name, teacher_id, class_id, semester_id)
       VALUES (?, ?, ?, ?)`,
    ).run("程式設計", teacherId, classId, semesterId).lastInsertRowid,
  );

  return {
    adminUserId,
    teacherId,
    otherTeacherId,
    studentId,
    classId,
    semesterId,
    courseId,
  };
}

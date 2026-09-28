/**
 * 成績模組測試。
 *
 * 重點放在三件事：
 *  1. 權限範圍（teacher 只能碰自己的課、student 完全不能寫、看成績單的範圍）
 *  2. 輸入驗證（分數範圍、名單白名單）
 *  3. 交易：批次儲存失敗時不能留下半套資料
 */
import { assert, assertEquals } from "@std/assert";
import type { AuthUser } from "../lib/auth-types.ts";
import { getDb } from "../lib/db.ts";
import {
  type GradeEntry,
  gradeFieldSchema,
  listCourseRoster,
  listGradeableCourses,
  listOwnTranscript,
  listStudentTranscript,
  saveCourseGrades,
} from "../lib/grades.ts";
import { freshDb, seedMinimal } from "./helpers.ts";

function actor(
  role: AuthUser["role"],
  ids: Partial<Pick<AuthUser, "teacherId" | "studentId" | "classId">> = {},
): AuthUser {
  return {
    id: 1,
    username: "t",
    name: "測試",
    role,
    teacherId: null,
    studentId: null,
    classId: null,
    ...ids,
  };
}

function entries(...list: [number, string, string][]): GradeEntry[] {
  return list.map(([studentId, score, comment]) => ({
    studentId,
    fields: gradeFieldSchema.parse({ score, comment }),
  }));
}

/** 加一位學生到指定班級，回傳 student id */
function addStudent(studentNo: string, classId: number): number {
  const db = getDb();
  const now = new Date().toISOString();
  const userId = Number(
    db.prepare(
      `INSERT INTO users (username, name, email, password_hash, role, created_at)
       VALUES (?, ?, NULL, 'x', 'student', ?)`,
    ).run(`u-${studentNo}`, `學生${studentNo}`, now).lastInsertRowid,
  );
  return Number(
    db.prepare(
      "INSERT INTO students (user_id, student_no, class_id) VALUES (?, ?, ?)",
    ).run(userId, studentNo, classId).lastInsertRowid,
  );
}

/** COUNT(*) 的結果在 node:sqlite 裡是 optional，這裡包一層取行數 */
function gradeCount(): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM grades").get() as {
    n: number;
  }).n;
}

function enroll(studentId: number, courseId: number): void {
  getDb().prepare(
    "INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)",
  ).run(studentId, courseId);
}

Deno.test("名冊＝班級學生，並帶出已登錄的成績", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const second = addStudent("11024002", ids.classId);

  const roster = listCourseRoster(
    actor("teacher", { teacherId: ids.teacherId }),
    ids.courseId,
  );
  assert(roster !== null);
  assertEquals(roster.length, 2);
  assertEquals(roster.map((r) => r.studentNo), ["11024001", "11024002"]);
  assertEquals(roster[0].score, null);
  assertEquals(roster[1].score, null);
  // 班級學生即使沒有 enrollments 紀錄也要出現在名冊
  assertEquals(roster[0].isEnrolled, false);

  const saved = saveCourseGrades(
    actor("teacher", { teacherId: ids.teacherId }),
    ids.courseId,
    entries([ids.studentId, "88", "不錯"], [second, "91.5", ""]),
  );
  assertEquals(saved.ok, true);

  const after = listCourseRoster(
    actor("teacher", { teacherId: ids.teacherId }),
    ids.courseId,
  );
  assertEquals(after?.[0].score, 88);
  assertEquals(after?.[0].comment, "不錯");
  assertEquals(after?.[1].score, 91.5);
  assertEquals(after?.[1].comment, null);
});

Deno.test("跨班選修的學生也會進名冊，且不重複", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const otherClass = Number(
    getDb().prepare(
      "INSERT INTO classes (name, year) VALUES ('一乙', '114')",
    ).run().lastInsertRowid,
  );
  const outsider = addStudent("11024099", otherClass);
  enroll(outsider, ids.courseId);

  const roster = listCourseRoster(
    actor("admin"),
    ids.courseId,
  );
  assertEquals(roster?.length, 2);
  assertEquals(roster?.[1].studentNo, "11024099");
  assertEquals(roster?.[1].isEnrolled, true);
});

Deno.test("teacher 不能登錄別人的課", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const result = saveCourseGrades(
    actor("teacher", { teacherId: ids.otherTeacherId }),
    ids.courseId,
    entries([ids.studentId, "80", ""]),
  );
  assertEquals(result.ok, false);
  assertEquals(
    gradeCount(),
    0,
  );
});

Deno.test("teacher 讀不到別人的課名冊", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  assertEquals(
    listCourseRoster(
      actor("teacher", { teacherId: ids.otherTeacherId }),
      ids.courseId,
    ),
    null,
  );
  assertEquals(
    listCourseRoster(actor("teacher", { teacherId: null }), ids.courseId),
    null,
  );
});

Deno.test("學生完全不能寫入成績", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const result = saveCourseGrades(
    actor("student", { studentId: ids.studentId }),
    ids.courseId,
    entries([ids.studentId, "100", ""]),
  );
  assertEquals(result.ok, false);
  assertEquals(gradeCount(), 0);
  // 學生也讀不到名冊
  assertEquals(
    listCourseRoster(
      actor("student", { studentId: ids.studentId }),
      ids.courseId,
    ),
    null,
  );
  assertEquals(listGradeableCourses(actor("student")), []);
});

Deno.test("分數超出 0~100 或不是數字時被擋下", () => {
  for (const raw of ["101", "-1", "abc"]) {
    const parsed = gradeFieldSchema.safeParse({ score: raw, comment: "" });
    assertEquals(parsed.success, false, `score=${raw} 應該被擋`);
  }
  for (const raw of ["", "0", "100", "66.5"]) {
    const parsed = gradeFieldSchema.safeParse({ score: raw, comment: "" });
    assertEquals(parsed.success, true, `score=${raw} 應該通過`);
  }
  const tooLong = gradeFieldSchema.safeParse({
    score: "80",
    comment: "x".repeat(201),
  });
  assertEquals(tooLong.success, false);
});

Deno.test("表單送出不在名冊上的學生會被拒絕且不寫入", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const otherClass = Number(
    getDb().prepare(
      "INSERT INTO classes (name, year) VALUES ('一乙', '114')",
    ).run().lastInsertRowid,
  );
  const outsider = addStudent("11024099", otherClass);

  const result = saveCourseGrades(
    actor("teacher", { teacherId: ids.teacherId }),
    ids.courseId,
    entries([outsider, "80", ""]),
  );
  assertEquals(result.ok, false);
  assertEquals(gradeCount(), 0);
});

Deno.test("分數與評語都清空＝取消登錄該筆成績", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const teacher = actor("teacher", { teacherId: ids.teacherId });
  saveCourseGrades(
    teacher,
    ids.courseId,
    entries([ids.studentId, "80", "加油"]),
  );
  assertEquals(gradeCount(), 1);

  const cleared = saveCourseGrades(
    teacher,
    ids.courseId,
    entries([ids.studentId, "", ""]),
  );
  assertEquals(cleared.ok, true);
  assertEquals(gradeCount(), 0);
});

Deno.test("只填評語也會留下成績列", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  saveCourseGrades(
    actor("teacher", { teacherId: ids.teacherId }),
    ids.courseId,
    entries([ids.studentId, "", "缺考但有補交報告"]),
  );
  const row = getDb().prepare(
    "SELECT score, comment FROM grades WHERE student_id = ?",
  ).get(ids.studentId) as { score: number | null; comment: string };
  assertEquals(row.score, null);
  assertEquals(row.comment, "缺考但有補交報告");
});

Deno.test("重複登錄是更新而不是新增一列", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const teacher = actor("teacher", { teacherId: ids.teacherId });
  saveCourseGrades(teacher, ids.courseId, entries([ids.studentId, "80", ""]));
  saveCourseGrades(
    teacher,
    ids.courseId,
    entries([ids.studentId, "95", "進步"]),
  );
  assertEquals(gradeCount(), 1);
  assertEquals(
    listStudentTranscript(actor("admin"), ids.studentId)[0].score,
    95,
  );
});

Deno.test("學期由課程帶入，不用呼叫端再指定", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const otherSemester = Number(
    getDb().prepare(
      `INSERT INTO semesters (name, is_current, start_date, end_date)
       VALUES ('115-1', 0, '2027-09-01', '2028-01-31')`,
    ).run().lastInsertRowid,
  );
  const oldCourse = Number(
    getDb().prepare(
      `INSERT INTO courses (name, teacher_id, class_id, semester_id)
       VALUES ('舊課', ?, ?, ?)`,
    ).run(ids.teacherId, ids.classId, otherSemester).lastInsertRowid,
  );

  saveCourseGrades(
    actor("teacher", { teacherId: ids.teacherId }),
    oldCourse,
    entries([ids.studentId, "77", ""]),
  );
  const row = getDb().prepare(
    "SELECT semester_id FROM grades WHERE course_id = ?",
  ).get(oldCourse) as { semester_id: number };
  assertEquals(row.semester_id, otherSemester);
});

Deno.test("成績單範圍：學生只看自己、teacher 只看自己授課的課", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const otherCourse = Number(
    getDb().prepare(
      `INSERT INTO courses (name, teacher_id, class_id, semester_id)
       VALUES ('別人的課', ?, ?, ?)`,
    ).run(ids.otherTeacherId, ids.classId, ids.semesterId).lastInsertRowid,
  );
  const teacher = actor("teacher", { teacherId: ids.teacherId });
  const other = actor("teacher", { teacherId: ids.otherTeacherId });

  saveCourseGrades(teacher, ids.courseId, entries([ids.studentId, "90", ""]));
  saveCourseGrades(other, otherCourse, entries([ids.studentId, "60", ""]));

  assertEquals(listStudentTranscript(actor("admin"), ids.studentId).length, 2);
  assertEquals(listStudentTranscript(teacher, ids.studentId).length, 1);
  assertEquals(listStudentTranscript(teacher, ids.studentId)[0].score, 90);
  assertEquals(listStudentTranscript(other, ids.studentId).length, 1);

  // 學生只能看自己：傳入參數會被忽略，條件一律用自己的 student_id
  const student = actor("student", { studentId: ids.studentId });
  assertEquals(listStudentTranscript(student, ids.studentId).length, 2);
  // 假冒別的 studentId 時不會看到對方的成績（查不到就是查不到）
  const impostor = actor("student", { studentId: ids.studentId + 999 });
  assertEquals(listStudentTranscript(impostor, ids.studentId).length, 0);
});

Deno.test("學生的成績單用 listOwnTranscript 取，身份不符時回空", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  saveCourseGrades(
    actor("teacher", { teacherId: ids.teacherId }),
    ids.courseId,
    entries([ids.studentId, "88", ""]),
  );
  const student = actor("student", { studentId: ids.studentId });
  const rows = listOwnTranscript(student);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].courseName, "程式設計");
  assertEquals(rows[0].isCurrentSemester, true);
  assertEquals(listOwnTranscript(actor("student", { studentId: null })), []);
});

Deno.test("課程總覽統計名冊人數、已登錄人數與平均", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const second = addStudent("11024002", ids.classId);
  const teacher = actor("teacher", { teacherId: ids.teacherId });

  const empty = listGradeableCourses(teacher);
  assertEquals(empty.length, 1);
  assertEquals(empty[0].rosterCount, 2);
  assertEquals(empty[0].gradedCount, 0);
  assertEquals(empty[0].average, null);

  saveCourseGrades(
    teacher,
    ids.courseId,
    entries([ids.studentId, "80", ""], [second, "100", ""]),
  );
  const after = listGradeableCourses(teacher);
  assertEquals(after[0].gradedCount, 2);
  assertEquals(after[0].average, 90);

  // admin 看到全校，teacher 只看到自己的
  assertEquals(listGradeableCourses(actor("admin")).length, 1);
});

Deno.test("依學期篩選課程總覽", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const otherSemester = Number(
    getDb().prepare(
      `INSERT INTO semesters (name, is_current, start_date, end_date)
       VALUES ('115-1', 0, '2027-09-01', '2028-01-31')`,
    ).run().lastInsertRowid,
  );
  getDb().prepare(
    `INSERT INTO courses (name, teacher_id, class_id, semester_id)
     VALUES ('下學期課', ?, ?, ?)`,
  ).run(ids.teacherId, ids.classId, otherSemester);

  assertEquals(listGradeableCourses(actor("admin"), ids.semesterId).length, 1);
  assertEquals(listGradeableCourses(actor("admin"), otherSemester).length, 1);
  assertEquals(
    listGradeableCourses(actor("admin"), ids.semesterId)[0].courseName,
    "程式設計",
  );
});

Deno.test("admin 可以代為登錄成績並留下稽核紀錄", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const result = saveCourseGrades(
    actor("admin"),
    ids.courseId,
    entries([ids.studentId, "75", "補登"]),
  );
  assertEquals(result.ok, true);
  const audit = getDb().prepare(
    "SELECT action, target_table FROM audit_logs WHERE target_table = 'grades'",
  ).get() as { action: string; target_table: string } | undefined;
  assertEquals(audit?.action, "update");
  assertEquals(audit?.target_table, "grades");
});

Deno.test("寫入失敗時整批 rollback，既有成績不受影響", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const db = getDb();
  const teacher = actor("teacher", { teacherId: ids.teacherId });
  saveCourseGrades(teacher, ids.courseId, entries([ids.studentId, "80", ""]));

  // 繞過 zod 直接塞超出範圍的分數，模擬表單被竄改／程式出包，
  // 由 DB 的 CHECK 約束擋下，saveCourseGrades 應該回 fail 而不是寫一半。
  const tampered: GradeEntry[] = [
    { studentId: ids.studentId, fields: { score: 1000, comment: null } },
  ];
  const result = saveCourseGrades(teacher, ids.courseId, tampered);
  assertEquals(result.ok, false);
  assertEquals(gradeCount(), 1);
  assertEquals(
    (db.prepare("SELECT score FROM grades WHERE student_id = ?").get(
      ids.studentId,
    ) as { score: number }).score,
    80,
  );
});

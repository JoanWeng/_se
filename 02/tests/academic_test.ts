/**
 * 學期 / 班級 / 課程 / 學生資料的測試。
 *
 * 這個模組的重點是「權限範圍」：同一支查詢函式被三種角色呼叫時，
 * 結果必須各自正確。這裡用 loadAuthUser 直接組出不同角色的 AuthUser，
 * 專測查詢層的範圍限制（路由層的守門另外測）。
 */
import { assert, assertEquals } from "@std/assert";
import { loadAuthUser } from "../lib/auth.ts";
import type { AuthUser } from "../lib/auth-types.ts";
import {
  classFieldSchema,
  createClass,
  deleteClass,
  getClass,
  listClasses,
  updateClass,
} from "../lib/classes.ts";
import {
  createCourse,
  deleteCourse,
  getCourse,
  listCourses,
  updateCourse,
} from "../lib/courses.ts";
import { getDb } from "../lib/db.ts";
import {
  createSemester,
  createSemesterSchema,
  getCurrentSemester,
  listSemesters,
  setCurrentSemester,
} from "../lib/semesters.ts";
import {
  getOwnStudent,
  getStudent,
  listStudents,
  setStudentActive,
  updateStudent,
} from "../lib/students.ts";
import { freshDb, seedMinimal } from "./helpers.ts";

function userOf(userId: number): AuthUser {
  const user = loadAuthUser(userId);
  assert(user !== null, "測試資料的帳號應該存在");
  return user;
}

function userIdBy(username: string): number {
  const row = getDb().prepare("SELECT id FROM users WHERE username = ?").get(
    username,
  ) as { id: number } | undefined;
  assert(row !== undefined, `找不到測試帳號 ${username}`);
  return row.id;
}

// ---------------------------------------------------------------- 學期

Deno.test("建立學期會拒絕與既有學期重疊的日期", () => {
  freshDb();
  const ids = seedMinimal(getDb());

  const overlap = createSemester(ids.adminUserId, {
    name: "114-2",
    startDate: "2026-12-01",
    endDate: "2027-06-30",
  });
  assertEquals(overlap.ok, false);
  if (!overlap.ok) assert(overlap.error.includes("重疊"));
  assertEquals(listSemesters().length, 1, "被擋下就不該留下資料");
});

Deno.test("相鄰的學期不算重疊", () => {
  freshDb();
  const ids = seedMinimal(getDb());

  // 既有學期到 2027-01-31，新學期 2027-02-01 開始
  const result = createSemester(ids.adminUserId, {
    name: "下一學期",
    startDate: "2027-02-01",
    endDate: "2027-07-31",
  });
  assertEquals(result.ok, true);
  assertEquals(listSemesters().length, 2);
});

Deno.test("結束日期早於開始日期會被擋（表單驗證與 lib 雙層）", () => {
  const parsed = createSemesterSchema.safeParse({
    name: "壞掉的學期",
    startDate: "2027-03-01",
    endDate: "2027-02-01",
  });
  assertEquals(parsed.success, false);

  freshDb();
  const ids = seedMinimal(getDb());
  const result = createSemester(ids.adminUserId, {
    name: "壞掉的學期",
    startDate: "2027-03-01",
    endDate: "2027-02-01",
  });
  assertEquals(result.ok, false);
  if (!result.ok) assert(result.error.includes("結束日期"));
});

Deno.test("切換目前學期後全庫永遠只有一個 current", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const second = createSemester(ids.adminUserId, {
    name: "114-2",
    startDate: "2027-02-01",
    endDate: "2027-07-31",
  });
  assertEquals(second.ok, true);

  const created = listSemesters().find((s) => s.name === "114-2");
  assert(created !== undefined);

  assertEquals(setCurrentSemester(ids.adminUserId, created.id).ok, true);
  assertEquals(getCurrentSemester()?.name, "114-2");
  assertEquals(listSemesters().filter((s) => s.isCurrent).length, 1);

  // 切回去也不會出現兩個 current（部分唯一索引在最後一道防線）
  assertEquals(setCurrentSemester(ids.adminUserId, ids.semesterId).ok, true);
  assertEquals(getCurrentSemester()?.id, ids.semesterId);
  assertEquals(listSemesters().filter((s) => s.isCurrent).length, 1);
});

Deno.test("切換目前學期：對象不存在時不動任何資料", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const result = setCurrentSemester(ids.adminUserId, 9999);
  assertEquals(result.ok, false);
  assertEquals(getCurrentSemester()?.id, ids.semesterId);
});

Deno.test("把已經是目前的學期設成目前會被擋", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  assertEquals(
    setCurrentSemester(ids.adminUserId, ids.semesterId).ok,
    false,
  );
});

// ---------------------------------------------------------------- 班級

Deno.test("班級列表會帶出導師、學生數與課程數", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const rows = listClasses();
  assertEquals(rows.length, 1);
  assertEquals(rows[0].name, "一甲");
  assertEquals(rows[0].homeroomTeacherName, "李老師");
  assertEquals(rows[0].studentCount, 1);
  assertEquals(rows[0].courseCount, 1);
  assertEquals(getClass(ids.classId)?.id, ids.classId);
});

Deno.test("建立班級會擋重複班名、不存在的導師與不存在的班級", () => {
  freshDb();
  const ids = seedMinimal(getDb());

  const dup = createClass(ids.adminUserId, {
    name: "一甲",
    year: "114",
    homeroomTeacherId: null,
  });
  assertEquals(dup.ok, false);

  const badTeacher = createClass(ids.adminUserId, {
    name: "一乙",
    year: "114",
    homeroomTeacherId: 9999,
  });
  assertEquals(badTeacher.ok, false);
  if (!badTeacher.ok) assert(badTeacher.error.includes("教師"));

  assertEquals(
    updateClass(ids.adminUserId, 9999, {
      name: "不存在",
      year: "114",
      homeroomTeacherId: null,
    }).ok,
    false,
  );
});

Deno.test("班級表單驗證：學年度只接受 2~4 位數字", () => {
  const bad = classFieldSchema.safeParse({ name: "一甲", year: "11４" });
  assertEquals(bad.success, false);
  const good = classFieldSchema.safeParse({ name: "一甲", year: "114" });
  assertEquals(good.success, true);
  // 沒選導師時要轉成 null，不能是 undefined（undefined 會讓 SQL 綁定失敗）
  assertEquals(good.data?.homeroomTeacherId, null);
});

Deno.test("停用教師後不能再被指定為導師", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  getDb().prepare("UPDATE teachers SET is_active = 0 WHERE id = ?").run(
    ids.teacherId,
  );

  const result = createClass(ids.adminUserId, {
    name: "一乙",
    year: "114",
    homeroomTeacherId: ids.teacherId,
  });
  assertEquals(result.ok, false);
});

Deno.test("有學生或課程的班級不能刪，完全沒引用的可以刪", () => {
  freshDb();
  const ids = seedMinimal(getDb());

  const hasStudents = deleteClass(ids.adminUserId, ids.classId);
  assertEquals(hasStudents.ok, false);
  if (!hasStudents.ok) assert(hasStudents.error.includes("學生"));

  const created = createClass(ids.adminUserId, {
    name: "空班",
    year: "114",
    homeroomTeacherId: null,
  });
  assertEquals(created.ok, true);
  const empty = listClasses().find((c) => c.name === "空班");
  assert(empty !== undefined);

  assertEquals(deleteClass(ids.adminUserId, empty.id).ok, true);
  assertEquals(listClasses().length, 1);
});

Deno.test("更新班級時不能跟自己撞名", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  createClass(ids.adminUserId, {
    name: "一乙",
    year: "114",
    homeroomTeacherId: null,
  });
  const other = listClasses().find((c) => c.name === "一乙");
  assert(other !== undefined);

  const clash = updateClass(ids.adminUserId, other.id, {
    name: "一甲",
    year: "114",
    homeroomTeacherId: null,
  });
  assertEquals(clash.ok, false);

  const ok = updateClass(ids.adminUserId, other.id, {
    name: "一乙",
    year: "115",
    homeroomTeacherId: ids.otherTeacherId,
  });
  assertEquals(ok.ok, true);
  assertEquals(getClass(other.id)?.year, "115");
  assertEquals(getClass(other.id)?.homeroomTeacherName, "陳老師");
});

Deno.test("更新班級但維持原班名時不該撞到自己", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const target = listClasses().find((c) => c.name === "一甲");
  assert(target !== undefined);

  const before = getClass(target.id);
  assert(before !== null);

  const result = updateClass(ids.adminUserId, target.id, {
    name: before.name,
    year: before.year,
    homeroomTeacherId: ids.otherTeacherId,
  });
  assertEquals(result.ok, true);
  assertEquals(getClass(target.id)?.homeroomTeacherName, "陳老師");
  assertEquals(getClass(target.id)?.name, before.name);
});

// ---------------------------------------------------------------- 課程

Deno.test("課程查詢範圍：admin 全部、teacher 自己授課、student 自己選修", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const db = getDb();

  // 另一位老師的課，掛在另一個班
  const otherClassId = Number(
    db.prepare(
      "INSERT INTO classes (name, year, homeroom_teacher_id) VALUES (?, ?, ?)",
    ).run("一乙", "114", ids.otherTeacherId).lastInsertRowid,
  );
  const otherCourseId = Number(
    db.prepare(
      `INSERT INTO courses (name, teacher_id, class_id, semester_id)
       VALUES (?, ?, ?, ?)`,
    ).run("物件導向", ids.otherTeacherId, otherClassId, ids.semesterId)
      .lastInsertRowid,
  );
  // 李老師的課，但學生沒選 —— 學生不該看到
  db.prepare(
    `INSERT INTO courses (name, teacher_id, class_id, semester_id)
     VALUES (?, ?, ?, ?)`,
  ).run("微積分", ids.teacherId, ids.classId, ids.semesterId);
  db.prepare("INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)")
    .run(ids.studentId, ids.courseId);

  const admin = userOf(ids.adminUserId);
  const teacher = userOf(userIdBy("t1"));
  const student = userOf(userIdBy("s1"));
  const otherTeacher = userOf(userIdBy("t2"));

  assertEquals(listCourses(admin).length, 3);
  assertEquals(
    listCourses(teacher).map((c) => c.id).includes(otherCourseId),
    false,
    "老師不該看到別人授課的課程",
  );
  assertEquals(listCourses(teacher).length, 2);
  assertEquals(
    listCourses(student).map((c) => c.id),
    [ids.courseId],
    "學生只該看到自己選修的課程",
  );
  assertEquals(listCourses(otherTeacher).map((c) => c.id), [otherCourseId]);

  // 範圍外的單筆查詢一樣要擋掉
  assertEquals(getCourse(student, otherCourseId), null);
  assertEquals(getCourse(teacher, otherCourseId), null);
  assert(getCourse(admin, otherCourseId) !== null);
});

Deno.test("沒有對應身份的帳號查不到任何東西（fail closed）", () => {
  freshDb();
  seedMinimal(getDb());
  const ghost: AuthUser = {
    id: 999,
    username: "ghost",
    name: "無身份",
    role: "teacher",
    teacherId: null,
    studentId: null,
    classId: null,
  };
  assertEquals(listCourses(ghost).length, 0);
  assertEquals(listStudents(ghost).total, 0);
});

Deno.test("建立課程會驗證教師、班級、學期都存在", () => {
  freshDb();
  const ids = seedMinimal(getDb());

  assertEquals(
    createCourse(ids.adminUserId, {
      name: "邊緣科學",
      teacherId: 9999,
      classId: ids.classId,
      semesterId: ids.semesterId,
      schedule: "",
    }).ok,
    false,
  );

  assertEquals(
    createCourse(ids.adminUserId, {
      name: "邊緣科學",
      teacherId: ids.teacherId,
      classId: ids.classId,
      semesterId: 9999,
      schedule: "",
    }).ok,
    false,
  );

  assertEquals(
    createCourse(ids.adminUserId, {
      name: "邊緣科學",
      teacherId: ids.teacherId,
      classId: 9999,
      semesterId: ids.semesterId,
      schedule: "",
    }).ok,
    false,
  );

  assertEquals(
    createCourse(ids.adminUserId, {
      name: "離線計算",
      teacherId: ids.teacherId,
      classId: ids.classId,
      semesterId: ids.semesterId,
      schedule: "週五 7-8 節",
    }).ok,
    true,
  );

  assertEquals(listCourses(userOf(ids.adminUserId)).length, 2);
});

Deno.test("有選課或成績的課程不能刪", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  getDb().prepare(
    "INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)",
  ).run(ids.studentId, ids.courseId);

  const blocked = deleteCourse(ids.adminUserId, ids.courseId);
  assertEquals(blocked.ok, false);
  if (!blocked.ok) assert(blocked.error.includes("選修"));

  assertEquals(
    createCourse(ids.adminUserId, {
      name: "沒人選的課",
      teacherId: ids.teacherId,
      classId: ids.classId,
      semesterId: ids.semesterId,
      schedule: "",
    }).ok,
    true,
  );

  const empty = listCourses(userOf(ids.adminUserId)).find(
    (c) => c.name === "沒人選的課",
  );
  assert(empty !== undefined);
  assertEquals(deleteCourse(ids.adminUserId, empty.id).ok, true);
});

Deno.test("更新課程可以換老師、班級與時間", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const result = updateCourse(ids.adminUserId, ids.courseId, {
    name: "程式設計（進階）",
    teacherId: ids.otherTeacherId,
    classId: ids.classId,
    semesterId: ids.semesterId,
    schedule: "週二 1-2 節",
  });
  assertEquals(result.ok, true);

  const course = getCourse(userOf(ids.adminUserId), ids.courseId);
  assertEquals(course?.name, "程式設計（進階）");
  assertEquals(course?.teacherName, "陳老師");
  assertEquals(course?.schedule, "週二 1-2 節");
  assertEquals(course?.isCurrentSemester, true);
});

// ---------------------------------------------------------------- 學生

Deno.test("學生查詢範圍：admin 全校、teacher 自己班、student 只有自己", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const db = getDb();
  const now = new Date().toISOString();

  const otherClassId = Number(
    db.prepare(
      "INSERT INTO classes (name, year, homeroom_teacher_id) VALUES (?, ?, ?)",
    ).run("一乙", "114", ids.otherTeacherId).lastInsertRowid,
  );
  const otherStudentId = Number(
    db.prepare(
      "INSERT INTO students (user_id, student_no, class_id) VALUES (?, ?, ?)",
    ).run(
      Number(
        db.prepare(
          `INSERT INTO users (username, name, email, password_hash, role, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run("s2", "小美", null, "x", "student", now).lastInsertRowid,
      ),
      "11024002",
      otherClassId,
    ).lastInsertRowid,
  );

  const admin = userOf(ids.adminUserId);
  const teacher = userOf(userIdBy("t1"));
  const student = userOf(userIdBy("s1"));

  assertEquals(listStudents(admin).total, 2);
  assertEquals(
    listStudents(teacher).rows.map((s) => s.id),
    [ids.studentId],
    "老師只該看到自己班的學生",
  );
  assertEquals(
    listStudents(student).rows.map((s) => s.id),
    [ids.studentId],
    "學生只該看到自己",
  );
  assertEquals(getStudent(student, otherStudentId), null);
  assertEquals(getStudent(teacher, otherStudentId), null);
  assert(getStudent(admin, otherStudentId) !== null);

  assertEquals(getOwnStudent(student)?.studentNo, "11024001");
  assertEquals(getOwnStudent(teacher), null);
});

Deno.test("學生搜尋支援學號、姓名、帳號，並擋掉 LIKE 萬用字元", () => {
  freshDb();
  seedMinimal(getDb());
  const admin = userOf(userIdBy("admin"));

  assertEquals(listStudents(admin, { keyword: "11024" }).total, 1);
  assertEquals(listStudents(admin, { keyword: "小明" }).total, 1);
  assertEquals(listStudents(admin, { keyword: "s1" }).total, 1);
  assertEquals(listStudents(admin, { keyword: "查無此人" }).total, 0);

  // % 與 _ 應該被當成一般字元，否則使用者輸入 % 就能列出全校
  assertEquals(listStudents(admin, { keyword: "%" }).total, 0);
  assertEquals(listStudents(admin, { keyword: "_" }).total, 0);
});

Deno.test("學生分頁會自動修正超出範圍的頁碼", () => {
  freshDb();
  seedMinimal(getDb());
  const admin = userOf(userIdBy("admin"));

  const first = listStudents(admin, { pageSize: 1, page: 1 });
  assertEquals(first.total, 1);
  assertEquals(first.pageCount, 1);
  assertEquals(first.rows.length, 1);

  const beyond = listStudents(admin, { pageSize: 1, page: 99 });
  assertEquals(beyond.page, 1, "頁碼超出範圍應拉回最後一頁而不是回空清單");
  assertEquals(beyond.rows.length, 1);
});

Deno.test("老師篩選班級時不會跨班查到別班的學生", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const otherClassId = Number(
    getDb().prepare(
      "INSERT INTO classes (name, year, homeroom_teacher_id) VALUES (?, ?, ?)",
    ).run("一乙", "114", ids.otherTeacherId).lastInsertRowid,
  );
  const teacher = userOf(userIdBy("t1"));
  // 老師指定別班的班級篩選：範圍條件擋下，結果必須是空的
  assertEquals(listStudents(teacher, { classId: otherClassId }).total, 0);
});

Deno.test("更新學生資料會同步 users.name，並驗證班級存在", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const admin = userOf(ids.adminUserId);

  assertEquals(
    updateStudent(ids.adminUserId, ids.studentId, {
      name: "王小明",
      classId: 9999,
    }).ok,
    false,
  );

  const result = updateStudent(ids.adminUserId, ids.studentId, {
    name: "王小明",
    birthDate: "2007-05-20",
    phone: "0912-000-000",
    emergencyContact: "王小明媽媽 0911-111-111",
    classId: null,
  });
  assertEquals(result.ok, true);

  const student = getStudent(admin, ids.studentId);
  assertEquals(student?.name, "王小明");
  assertEquals(student?.birthDate, "2007-05-20");
  assertEquals(student?.emergencyContact, "王小明媽媽 0911-111-111");
  assertEquals(student?.classId, null, "清空班級要變成 null，不能保留舊值");
  // users.name 也要跟上，否則登入後顯示的名字會和學生資料不一致
  assertEquals(userOf(userIdBy("s1")).name, "王小明");
});

Deno.test("更新不存在的學生會回錯誤", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  assertEquals(
    updateStudent(ids.adminUserId, 9999, {
      name: "無",
      birthDate: "",
      phone: "",
      emergencyContact: "",
      classId: null,
    }).ok,
    false,
  );
});

Deno.test("停讀不會讓登入帳號失效，復學會還原", () => {
  freshDb();
  const ids = seedMinimal(getDb());
  const admin = userOf(ids.adminUserId);

  assertEquals(
    setStudentActive(ids.adminUserId, ids.studentId, false).ok,
    true,
  );
  assertEquals(getStudent(admin, ids.studentId)?.isActive, false);
  assertEquals(
    getStudent(admin, ids.studentId)?.accountActive,
    true,
    "停讀不應該動到登入帳號",
  );

  // 預設不顯示停用學生
  assertEquals(listStudents(admin, { includeInactive: false }).total, 0);
  assertEquals(listStudents(admin, { includeInactive: true }).total, 1);

  assertEquals(setStudentActive(ids.adminUserId, ids.studentId, true).ok, true);
  assertEquals(listStudents(admin).total, 1);
});

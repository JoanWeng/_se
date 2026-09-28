import { page } from "fresh";
import { Flash } from "../components/Flash.tsx";
import { Layout } from "../components/Layout.tsx";
import { listClasses, listTeacherOptions } from "../lib/classes.ts";
import {
  courseFieldSchema,
  createCourse,
  deleteCourse,
  getCourse,
  listCourses,
  updateCourse,
} from "../lib/courses.ts";
import { formatZodError, formToRecord, intParam } from "../lib/http.ts";
import type { WriteResult } from "../lib/result.ts";
import { can, ROLE_LABELS } from "../lib/roles.ts";
import { listSemesters } from "../lib/semesters.ts";
import { define } from "../utils.ts";
import { z } from "zod";

const idSchema = z.coerce.number().int().positive();

interface CoursesData {
  message: string | null;
  error: string | null;
  editingId: number | null;
}

/** 說明目前這份清單是怎麼被限制的，讓使用者不會以為資料不見了 */
const SCOPE_HINT = {
  teacher: "只顯示您授課的課程。",
  student: "只顯示您選修的課程。",
  admin: "",
} as const;

function handleAction(
  actorId: number,
  form: FormData,
): { result: WriteResult; editingId: number | null } {
  const raw = formToRecord(form);
  const id = raw.courseId === undefined
    ? null
    : idSchema.safeParse(raw.courseId);
  const courseId = id === null ? null : (id.success ? id.data : null);

  if (raw.action === "create") {
    const parsed = courseFieldSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        result: { ok: false, error: formatZodError(parsed.error) },
        editingId: null,
      };
    }
    return { result: createCourse(actorId, parsed.data), editingId: null };
  }

  if (raw.action === "update") {
    if (courseId === null) {
      return { result: { ok: false, error: "無效的課程 id" }, editingId: null };
    }
    const parsed = courseFieldSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        result: { ok: false, error: formatZodError(parsed.error) },
        editingId: courseId,
      };
    }
    return {
      result: updateCourse(actorId, courseId, parsed.data),
      editingId: null,
    };
  }

  if (raw.action === "delete") {
    if (courseId === null) {
      return { result: { ok: false, error: "無效的課程 id" }, editingId: null };
    }
    return { result: deleteCourse(actorId, courseId), editingId: null };
  }

  return { result: { ok: false, error: "未知的操作" }, editingId: null };
}

export const handler = define.handlers({
  GET(ctx) {
    const editingId = intParam(new URL(ctx.req.url).searchParams, "edit", 0);
    return page<CoursesData>({
      message: null,
      error: null,
      editingId: editingId > 0 ? editingId : null,
    });
  },

  async POST(ctx) {
    const user = ctx.state.user;
    if (user === null) return new Response("尚未登入", { status: 401 });
    if (!can(user.role, "courses:write")) {
      return new Response("只有行政人員可以維護課程", { status: 403 });
    }

    const { result, editingId } = handleAction(
      user.id,
      await ctx.req.formData(),
    );
    return page<CoursesData>(
      result.ok
        ? { message: result.message, error: null, editingId: null }
        : { message: null, error: result.error, editingId },
      { status: result.ok ? 200 : 400 },
    );
  },
});

export default define.page<typeof handler>(function Courses({ data, state }) {
  const user = state.user;
  const writable = user !== null && can(user.role, "courses:write");
  // 查詢範圍在 SQL 裡就限定了（見 lib/courses.ts scopeClause）
  const courses = user === null ? [] : listCourses(user);
  const teachers = listTeacherOptions();
  const classes = listClasses();
  const semesters = listSemesters();
  const editing = user === null || data.editingId === null
    ? null
    : getCourse(user, data.editingId);

  const values = editing ?? {
    name: "",
    teacherId: null,
    classId: null,
    semesterId: semesters.find((s) => s.isCurrent)?.id ?? null,
    schedule: "",
  };

  const hint = user === null ? "" : SCOPE_HINT[user.role];

  return (
    <Layout user={user} title="課程管理">
      <Flash message={data.message} error={data.error} />
      {hint !== "" && <p class="muted">{hint}</p>}

      {writable && (
        <section class="card">
          <h2 class="card-title">
            {editing === null ? "開課" : `編輯課程：${editing.name}`}
          </h2>
          <form method="post" class="form-grid">
            <input
              type="hidden"
              name="action"
              value={editing === null ? "create" : "update"}
            />
            {editing !== null && (
              <input type="hidden" name="courseId" value={editing.id} />
            )}
            <label class="field">
              <span>課程名稱</span>
              <input
                type="text"
                name="name"
                required
                maxLength={64}
                value={values.name}
              />
            </label>
            <label class="field">
              <span>授課教師</span>
              <select name="teacherId" required>
                <option value="">請選擇</option>
                {teachers.map((teacher) => (
                  <option
                    key={teacher.id}
                    value={teacher.id}
                    selected={values.teacherId === teacher.id}
                  >
                    {teacher.name}
                  </option>
                ))}
              </select>
            </label>
            <label class="field">
              <span>班級</span>
              <select name="classId" required>
                <option value="">請選擇</option>
                {classes.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    selected={values.classId === item.id}
                  >
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label class="field">
              <span>學期</span>
              <select name="semesterId" required>
                {semesters.map((semester) => (
                  <option
                    key={semester.id}
                    value={semester.id}
                    selected={values.semesterId === semester.id}
                  >
                    {semester.name}
                    {semester.isCurrent ? "（目前）" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label class="field">
              <span>上課時段</span>
              <input
                type="text"
                name="schedule"
                maxLength={64}
                value={values.schedule ?? ""}
                placeholder="例如 週一 3-4 節"
              />
            </label>
            <div class="form-actions">
              {editing !== null && <a class="btn" href="/courses">取消</a>}
              <button type="submit" class="btn btn-primary">
                {editing === null ? "開課" : "儲存"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section class="card">
        <h2 class="card-title">課程列表（{courses.length}）</h2>
        {courses.length === 0
          ? (
            <p class="muted">
              {user !== null && user.role === "student"
                ? "您目前沒有選修任何課程。"
                : "尚無課程資料。"}
            </p>
          )
          : (
            <table class="table">
              <thead>
                <tr>
                  <th>課程</th>
                  <th>授課教師</th>
                  <th>班級</th>
                  <th>學期</th>
                  <th>上課時段</th>
                  <th>選課</th>
                  <th>成績</th>
                  {writable && <th class="col-actions">操作</th>}
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr key={course.id}>
                    <td>
                      {course.name}
                      {course.isCurrentSemester && (
                        <span class="badge badge-ok">本學期</span>
                      )}
                    </td>
                    <td>{course.teacherName}</td>
                    <td>{course.className}</td>
                    <td class="muted">{course.semesterName}</td>
                    <td class="muted">{course.schedule ?? "未排定"}</td>
                    <td>{course.enrolledCount}</td>
                    <td>{course.gradeCount}</td>
                    {writable && (
                      <td class="col-actions">
                        <div class="row-actions">
                          <a
                            class="btn btn-sm"
                            href={`/courses?edit=${course.id}`}
                          >
                            編輯
                          </a>
                          <form method="post" class="inline-form">
                            <input
                              type="hidden"
                              name="action"
                              value="delete"
                            />
                            <input
                              type="hidden"
                              name="courseId"
                              value={course.id}
                            />
                            <button type="submit" class="btn btn-sm">
                              刪除
                            </button>
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        {writable === false && user !== null && (
          <p class="muted">
            課程由{ROLE_LABELS.admin}開課與維護。
          </p>
        )}
      </section>
    </Layout>
  );
});

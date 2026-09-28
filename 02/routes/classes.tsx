import { page } from "fresh";
import { Flash } from "../components/Flash.tsx";
import { Layout } from "../components/Layout.tsx";
import { formatZodError, formToRecord, intParam } from "../lib/http.ts";
import { can } from "../lib/roles.ts";
import {
  classFieldSchema,
  createClass,
  deleteClass,
  getClass,
  listClasses,
  listTeacherOptions,
  updateClass,
} from "../lib/classes.ts";
import type { WriteResult } from "../lib/result.ts";
import { define } from "../utils.ts";
import { z } from "zod";

const idSchema = z.coerce.number().int().positive();

interface ClassesData {
  message: string | null;
  error: string | null;
  /** 正在編輯的班級 id；null 代表顯示「建立」表單 */
  editingId: number | null;
}

function handleAction(
  actorId: number,
  form: FormData,
): { result: WriteResult; editingId: number | null } {
  const raw = formToRecord(form);
  const id = raw.classId === undefined ? null : idSchema.safeParse(raw.classId);
  const classId = id === null ? null : (id.success ? id.data : null);
  const invalidId = id !== null && !id.success;

  if (invalidId) {
    return { result: { ok: false, error: "無效的班級 id" }, editingId: null };
  }

  if (raw.action === "create") {
    const parsed = classFieldSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        result: { ok: false, error: formatZodError(parsed.error) },
        editingId: null,
      };
    }
    return { result: createClass(actorId, parsed.data), editingId: null };
  }

  if (raw.action === "update") {
    if (classId === null) {
      return { result: { ok: false, error: "無效的班級 id" }, editingId: null };
    }
    const parsed = classFieldSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        result: { ok: false, error: formatZodError(parsed.error) },
        editingId: classId,
      };
    }
    return {
      result: updateClass(actorId, classId, parsed.data),
      editingId: null,
    };
  }

  if (raw.action === "delete") {
    if (classId === null) {
      return { result: { ok: false, error: "無效的班級 id" }, editingId: null };
    }
    return { result: deleteClass(actorId, classId), editingId: null };
  }

  return { result: { ok: false, error: "未知的操作" }, editingId: null };
}

export const handler = define.handlers({
  GET(ctx) {
    const editingId = intParam(
      new URL(ctx.req.url).searchParams,
      "edit",
      0,
    );
    return page<ClassesData>({
      message: null,
      error: null,
      editingId: editingId > 0 ? editingId : null,
    });
  },

  async POST(ctx) {
    const user = ctx.state.user;
    if (user === null) return new Response("尚未登入", { status: 401 });
    if (!can(user.role, "classes:write")) {
      return new Response("只有行政人員可以維護班級", { status: 403 });
    }

    const { result, editingId } = handleAction(
      user.id,
      await ctx.req.formData(),
    );
    return page<ClassesData>(
      result.ok
        ? { message: result.message, error: null, editingId: null }
        : { message: null, error: result.error, editingId },
      { status: result.ok ? 200 : 400 },
    );
  },
});

export default define.page<typeof handler>(function Classes({ data, state }) {
  const user = state.user;
  const writable = user !== null && can(user.role, "classes:write");
  const classes = listClasses();
  const teachers = listTeacherOptions();
  const editing = data.editingId === null ? null : getClass(data.editingId);
  const formValues = editing ?? { name: "", year: "", homeroomTeacherId: null };

  const teacherSelect = (name: string) => (
    <select name={name}>
      <option value="" selected={formValues.homeroomTeacherId === null}>
        （未指定）
      </option>
      {teachers.map((teacher) => (
        <option
          key={teacher.id}
          value={teacher.id}
          selected={formValues.homeroomTeacherId === teacher.id}
        >
          {teacher.name}
        </option>
      ))}
    </select>
  );

  return (
    <Layout user={user} title="班級管理">
      <Flash message={data.message} error={data.error} />

      {writable && (
        <section class="card">
          <h2 class="card-title">
            {editing === null ? "建立班級" : `編輯班級：${editing.name}`}
          </h2>
          <form method="post" class="form-grid">
            <input
              type="hidden"
              name="action"
              value={editing === null ? "create" : "update"}
            />
            {editing !== null && (
              <input type="hidden" name="classId" value={editing.id} />
            )}
            <label class="field">
              <span>班級名稱</span>
              <input
                type="text"
                name="name"
                required
                maxLength={32}
                value={formValues.name}
                placeholder="例如 資工一甲"
              />
            </label>
            <label class="field">
              <span>學年度（民國）</span>
              <input
                type="text"
                name="year"
                required
                maxLength={4}
                pattern="[0-9]{2,4}"
                value={formValues.year}
                placeholder="114"
              />
            </label>
            <label class="field">
              <span>導師</span>
              {teacherSelect("homeroomTeacherId")}
            </label>
            <div class="form-actions">
              {editing !== null && <a class="btn" href="/classes">取消</a>}
              <button type="submit" class="btn btn-primary">
                {editing === null ? "建立" : "儲存"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section class="card">
        <h2 class="card-title">班級列表（{classes.length}）</h2>
        {classes.length === 0
          ? <p class="muted">尚未建立任何班級。</p>
          : (
            <table class="table">
              <thead>
                <tr>
                  <th>班級</th>
                  <th>學年度</th>
                  <th>導師</th>
                  <th>學生數</th>
                  <th>課程數</th>
                  {writable && <th class="col-actions">操作</th>}
                </tr>
              </thead>
              <tbody>
                {classes.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td class="muted">{item.year}</td>
                    <td>
                      {item.homeroomTeacherName ?? (
                        <span class="muted">未指定</span>
                      )}
                    </td>
                    <td>{item.studentCount}</td>
                    <td>{item.courseCount}</td>
                    {writable && (
                      <td class="col-actions">
                        <div class="row-actions">
                          <a
                            class="btn btn-sm"
                            href={`/classes?edit=${item.id}`}
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
                              name="classId"
                              value={item.id}
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
        {!writable && (
          <p class="muted">班級資料由行政人員維護，此頁僅供查詢。</p>
        )}
      </section>
    </Layout>
  );
});

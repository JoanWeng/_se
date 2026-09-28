import { page } from "fresh";
import { Flash, Pagination } from "../components/Flash.tsx";
import { Layout } from "../components/Layout.tsx";
import { listClasses } from "../lib/classes.ts";
import {
  boolParam,
  formatZodError,
  formToRecord,
  intParam,
} from "../lib/http.ts";
import type { WriteResult } from "../lib/result.ts";
import { can, ROLE_LABELS } from "../lib/roles.ts";
import {
  getOwnStudent,
  getStudent,
  listStudents,
  setStudentActive,
  studentFieldSchema,
  type StudentQuery,
  updateStudent,
} from "../lib/students.ts";
import { define } from "../utils.ts";
import { z } from "zod";

const idSchema = z.coerce.number().int().positive();

const DEFAULT_QUERY: StudentQuery = {
  keyword: "",
  classId: null,
  includeInactive: false,
  page: 1,
  pageSize: 20,
};

interface StudentsData {
  message: string | null;
  error: string | null;
  editingId: number | null;
  /** 目前生效的篩選條件，翻頁時要原樣帶著 */
  query: StudentQuery;
}

/** 學生自己看自己：不需要篩選器，畫面也換成資料卡 */
const SCOPE_HINT = {
  admin: "",
  teacher: "只顯示您擔任導師的班級學生。",
  student: "",
} as const;

function handleAction(
  actorId: number,
  form: FormData,
): { result: WriteResult; editingId: number | null } {
  const raw = formToRecord(form);
  const id = raw.studentId === undefined
    ? null
    : idSchema.safeParse(raw.studentId);
  const studentId = id === null ? null : (id.success ? id.data : null);

  if (raw.action === "update") {
    if (studentId === null) {
      return { result: { ok: false, error: "無效的學生 id" }, editingId: null };
    }
    const parsed = studentFieldSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        result: { ok: false, error: formatZodError(parsed.error) },
        editingId: studentId,
      };
    }
    return {
      result: updateStudent(actorId, studentId, parsed.data),
      editingId: null,
    };
  }

  if (raw.action === "deactivate" || raw.action === "activate") {
    if (studentId === null) {
      return { result: { ok: false, error: "無效的學生 id" }, editingId: null };
    }
    return {
      result: setStudentActive(
        actorId,
        studentId,
        raw.action === "activate",
      ),
      editingId: null,
    };
  }

  return { result: { ok: false, error: "未知的操作" }, editingId: null };
}

export const handler = define.handlers({
  GET(ctx) {
    const params = new URL(ctx.req.url).searchParams;
    const classId = intParam(params, "classId", 0);
    const editingId = intParam(params, "edit", 0);
    return page<StudentsData>({
      message: null,
      error: null,
      editingId: editingId > 0 ? editingId : null,
      query: {
        keyword: params.get("q")?.trim() ?? "",
        classId: classId > 0 ? classId : null,
        includeInactive: boolParam(params, "all"),
        page: 1,
        pageSize: 20,
      },
    });
  },

  async POST(ctx) {
    const user = ctx.state.user;
    if (user === null) return new Response("尚未登入", { status: 401 });
    if (!can(user.role, "students:write")) {
      return new Response("只有行政人員可以維護學生資料", { status: 403 });
    }

    const { result, editingId } = handleAction(
      user.id,
      await ctx.req.formData(),
    );
    return page<StudentsData>(
      result.ok
        ? {
          message: result.message,
          error: null,
          editingId: null,
          query: DEFAULT_QUERY,
        }
        : {
          message: null,
          error: result.error,
          editingId,
          query: DEFAULT_QUERY,
        },
      { status: result.ok ? 200 : 400 },
    );
  },
});

export default define.page<typeof handler>(function Students({ data, state }) {
  const user = state.user;
  const writable = user !== null && can(user.role, "students:write");
  const classes = listClasses();
  const editing = user === null || data.editingId === null
    ? null
    : getStudent(user, data.editingId);

  // 學生的「自己」用同一支查詢函式取得，權限邏輯不會分岔
  const own = user !== null && user.role === "student"
    ? getOwnStudent(user)
    : null;

  const paged = user === null
    ? { rows: [], total: 0, page: 1, pageSize: 20, pageCount: 1 }
    : listStudents(user, data.query);

  const queryForLinks = {
    q: data.query.keyword,
    classId: data.query.classId,
    all: data.query.includeInactive ? "1" : null,
  };

  const editingValues = editing ?? {
    name: "",
    birthDate: "",
    phone: "",
    emergencyContact: "",
    classId: null,
  };

  return (
    <Layout user={user} title="學生資料">
      <Flash message={data.message} error={data.error} />
      {user !== null && SCOPE_HINT[user.role] !== "" && (
        <p class="muted">{SCOPE_HINT[user.role]}</p>
      )}

      {/* ------------------------------------------------ 學生的個人資料卡 */}
      {own !== null && (
        <section class="card">
          <h2 class="card-title">我的資料</h2>
          <dl class="detail-list">
            <dt>學號</dt>
            <dd>{own.studentNo}</dd>
            <dt>姓名</dt>
            <dd>{own.name}</dd>
            <dt>登入帳號</dt>
            <dd>{own.username}</dd>
            <dt>班級</dt>
            <dd>{own.className ?? "未分班"}</dd>
            <dt>出生日期</dt>
            <dd>{own.birthDate ?? "未填"}</dd>
            <dt>聯絡電話</dt>
            <dd>{own.phone ?? "未填"}</dd>
            <dt>緊急聯絡人</dt>
            <dd>{own.emergencyContact ?? "未填"}</dd>
          </dl>
          <p class="muted">
            個人資料如需修正，請洽{ROLE_LABELS
              .admin}。登入帳號則由行政人員於帳號管理頁重設密碼。
          </p>
        </section>
      )}

      {/* ------------------------------------------------------------ 篩選 */}
      {own === null && user !== null && user.role !== "student" && (
        <section class="card">
          <h2 class="card-title">查詢條件</h2>
          <form method="get" class="filter-bar">
            <label class="field">
              <span>學號／姓名／帳號</span>
              <input
                type="search"
                name="q"
                value={data.query.keyword}
                placeholder="輸入關鍵字"
              />
            </label>
            {writable && (
              <label class="field">
                <span>班級</span>
                <select name="classId">
                  <option value="">全部班級</option>
                  {classes.map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                      selected={data.query.classId === item.id}
                    >
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {writable && (
              <label class="checkbox">
                <input
                  type="checkbox"
                  name="all"
                  value="1"
                  checked={data.query.includeInactive}
                />
                <span>包含停讀學生</span>
              </label>
            )}
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">查詢</button>
              <a class="btn" href="/students">清除</a>
            </div>
          </form>
        </section>
      )}

      {/* ------------------------------------------------------- 編輯表單 */}
      {writable && editing !== null && (
        <section class="card">
          <h2 class="card-title">編輯學生：{editing.studentNo}</h2>
          <form method="post" class="form-grid">
            <input type="hidden" name="action" value="update" />
            <input type="hidden" name="studentId" value={editing.id} />
            <label class="field">
              <span>姓名</span>
              <input
                type="text"
                name="name"
                required
                maxLength={64}
                value={editingValues.name}
              />
            </label>
            <label class="field">
              <span>班級</span>
              <select name="classId">
                <option value="" selected={editingValues.classId === null}>
                  （未分班）
                </option>
                {classes.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    selected={editingValues.classId === item.id}
                  >
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label class="field">
              <span>出生日期</span>
              <input
                type="date"
                name="birthDate"
                value={editingValues.birthDate ?? ""}
              />
            </label>
            <label class="field">
              <span>聯絡電話</span>
              <input
                type="text"
                name="phone"
                maxLength={32}
                value={editingValues.phone ?? ""}
              />
            </label>
            <label class="field">
              <span>緊急聯絡人</span>
              <input
                type="text"
                name="emergencyContact"
                maxLength={128}
                value={editingValues.emergencyContact ?? ""}
              />
            </label>
            <div class="form-actions">
              <a class="btn" href="/students">取消</a>
              <button type="submit" class="btn btn-primary">儲存</button>
            </div>
          </form>
        </section>
      )}

      {/* --------------------------------------------------------- 學生清單 */}
      {own === null && (
        <section class="card">
          <h2 class="card-title">學生列表</h2>
          {paged.rows.length === 0
            ? <p class="muted">沒有符合條件的學生。</p>
            : (
              <table class="table">
                <thead>
                  <tr>
                    <th>學號</th>
                    <th>姓名</th>
                    <th>帳號</th>
                    <th>班級</th>
                    <th>電話</th>
                    <th>狀態</th>
                    {writable && <th class="col-actions">操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {paged.rows.map((student) => (
                    <tr
                      key={student.id}
                      class={student.isActive ? "" : "row-inactive"}
                    >
                      <td>{student.studentNo}</td>
                      <td>{student.name}</td>
                      <td class="muted">{student.username}</td>
                      <td>
                        {student.className ?? <span class="muted">未分班</span>}
                      </td>
                      <td class="muted">{student.phone ?? "未填"}</td>
                      <td>
                        {student.isActive
                          ? <span class="badge badge-ok">在學</span>
                          : <span class="badge badge-off">停讀</span>}
                        {!student.accountActive && (
                          <span class="badge badge-off">帳號停用</span>
                        )}
                      </td>
                      {writable && (
                        <td class="col-actions">
                          <div class="row-actions">
                            <a
                              class="btn btn-sm"
                              href={`/students?edit=${student.id}`}
                            >
                              編輯
                            </a>
                            <a
                              class="btn btn-sm"
                              href={`/grades?student=${student.id}`}
                            >
                              成績單
                            </a>
                            <form method="post" class="inline-form">
                              <input
                                type="hidden"
                                name="action"
                                value={student.isActive
                                  ? "deactivate"
                                  : "activate"}
                              />
                              <input
                                type="hidden"
                                name="studentId"
                                value={student.id}
                              />
                              <button type="submit" class="btn btn-sm">
                                {student.isActive ? "停讀" : "復學"}
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
          {paged.pageCount > 1 && (
            <Pagination
              path="/students"
              page={paged.page}
              pageCount={paged.pageCount}
              total={paged.total}
              query={queryForLinks}
            />
          )}
        </section>
      )}
    </Layout>
  );
});

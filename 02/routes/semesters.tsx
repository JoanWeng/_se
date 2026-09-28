import { page } from "fresh";
import { Flash } from "../components/Flash.tsx";
import { Layout } from "../components/Layout.tsx";
import { formatZodError, formToRecord } from "../lib/http.ts";
import { can } from "../lib/roles.ts";
import {
  createSemester,
  createSemesterSchema,
  getCurrentSemester,
  listSemesters,
  setCurrentSemester,
} from "../lib/semesters.ts";
import type { WriteResult } from "../lib/result.ts";
import { define } from "../utils.ts";
import { z } from "zod";

const idSchema = z.coerce.number().int().positive();

interface SemestersData {
  message: string | null;
  error: string | null;
}

function handleAction(actorId: number, form: FormData): WriteResult {
  const raw = formToRecord(form);

  if (raw.action === "create") {
    const parsed = createSemesterSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: formatZodError(parsed.error) };
    }
    return createSemester(actorId, parsed.data);
  }

  if (raw.action === "set_current") {
    const id = idSchema.safeParse(raw.semesterId);
    if (!id.success) return { ok: false, error: "無效的學期 id" };
    return setCurrentSemester(actorId, id.data);
  }

  return { ok: false, error: "未知的操作" };
}

export const handler = define.handlers({
  GET() {
    return page<SemestersData>({ message: null, error: null });
  },

  async POST(ctx) {
    const user = ctx.state.user;
    if (user === null) return new Response("尚未登入", { status: 401 });
    if (!can(user.role, "semesters:write")) {
      return new Response("只有行政人員可以維護學期", { status: 403 });
    }

    const result = handleAction(user.id, await ctx.req.formData());
    return page<SemestersData>(
      result.ok ? { message: result.message, error: null } : {
        message: null,
        error: result.error,
      },
      { status: result.ok ? 200 : 400 },
    );
  },
});

export default define.page<typeof handler>(function Semesters({ data, state }) {
  const user = state.user;
  const writable = user !== null && can(user.role, "semesters:write");
  const semesters = listSemesters();
  const current = getCurrentSemester();

  return (
    <Layout user={user} title="學期管理">
      <Flash message={data.message} error={data.error} />

      {current !== null && (
        <div class="card">
          <p>
            目前學期：<strong>{current.name}</strong>
            <span class="muted">
              {current.startDate} ~ {current.endDate}
            </span>
          </p>
          <p class="muted">
            課程與成績都關聯到學期，切换後新建立的資料會歸入新學期，舊學期資料仍可查詢。
          </p>
        </div>
      )}

      {writable && (
        <section class="card">
          <h2 class="card-title">建立學期</h2>
          <form method="post" class="form-grid">
            <input type="hidden" name="action" value="create" />
            <label class="field">
              <span>學期名稱</span>
              <input
                type="text"
                name="name"
                required
                maxLength={64}
                placeholder="例如 115學年度第1學期"
              />
            </label>
            <label class="field">
              <span>開始日期</span>
              <input type="date" name="startDate" required />
            </label>
            <label class="field">
              <span>結束日期</span>
              <input type="date" name="endDate" required />
            </label>
            <div class="form-actions checkbox-field">
              <label class="checkbox">
                <input type="checkbox" name="makeCurrent" value="on" />
                <span>設為目前學期</span>
              </label>
              <button type="submit" class="btn btn-primary">建立</button>
            </div>
          </form>
        </section>
      )}

      <section class="card">
        <h2 class="card-title">學期列表（{semesters.length}）</h2>
        {semesters.length === 0
          ? <p class="muted">尚未建立任何學期。</p>
          : (
            <table class="table">
              <thead>
                <tr>
                  <th>學期</th>
                  <th>起訖</th>
                  <th>狀態</th>
                  {writable && <th class="col-actions">操作</th>}
                </tr>
              </thead>
              <tbody>
                {semesters.map((semester) => (
                  <tr key={semester.id}>
                    <td>{semester.name}</td>
                    <td class="muted">
                      {semester.startDate} ~ {semester.endDate}
                    </td>
                    <td>
                      {semester.isCurrent
                        ? <span class="badge badge-ok">目前學期</span>
                        : <span class="badge">歷史學期</span>}
                    </td>
                    {writable && (
                      <td class="col-actions">
                        {semester.isCurrent
                          ? <span class="muted">—</span>
                          : (
                            <form method="post" class="inline-form">
                              <input
                                type="hidden"
                                name="action"
                                value="set_current"
                              />
                              <input
                                type="hidden"
                                name="semesterId"
                                value={semester.id}
                              />
                              <button type="submit" class="btn btn-sm">
                                設為目前
                              </button>
                            </form>
                          )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </section>
    </Layout>
  );
});

import { page } from "fresh";
import { z } from "zod";
import { Layout } from "../../components/Layout.tsx";
import { formatZodError, formToRecord } from "../../lib/http.ts";
import { ROLE_LABELS, ROLES } from "../../lib/roles.ts";
import {
  createUser,
  createUserSchema,
  listUsers,
  resetUserPassword,
  setUserActive,
} from "../../lib/users.ts";
import { define } from "../../utils.ts";

const idSchema = z.coerce.number().int().positive();

interface UsersData {
  message: string | null;
  error: string | null;
}

function handleAction(
  actorId: number,
  form: FormData,
): UsersData {
  const raw = formToRecord(form);
  const action = raw.action;

  if (action === "create") {
    const parsed = createUserSchema.safeParse(raw);
    if (!parsed.success) {
      return { message: null, error: formatZodError(parsed.error) };
    }
    const result = createUser(actorId, parsed.data);
    return result.ok
      ? { message: `已建立帳號 ${parsed.data.username}`, error: null }
      : { message: null, error: result.error };
  }

  if (action === "deactivate" || action === "activate") {
    const id = idSchema.safeParse(raw.userId);
    if (!id.success) return { message: null, error: "無效的帳號 id" };
    const result = setUserActive(actorId, id.data, action === "activate");
    return result.ok
      ? { message: result.message, error: null }
      : { message: null, error: result.error };
  }

  if (action === "reset_password") {
    const id = idSchema.safeParse(raw.userId);
    if (!id.success) return { message: null, error: "無效的帳號 id" };
    const result = resetUserPassword(actorId, id.data, raw.newPassword ?? "");
    return result.ok
      ? { message: result.message, error: null }
      : { message: null, error: result.error };
  }

  return { message: null, error: "未知的操作" };
}

export const handler = define.handlers({
  GET() {
    return page<UsersData>({ message: null, error: null });
  },

  async POST(ctx) {
    if (ctx.state.user === null) {
      return page<UsersData>({ message: null, error: "尚未登入" }, {
        status: 401,
      });
    }
    const result = await handleAction(
      ctx.state.user.id,
      await ctx.req.formData(),
    );
    const status = result.error === null ? 200 : 400;
    return page<UsersData>(result, { status });
  },
});

export default define.page<typeof handler>(
  function AdminUsers({ data, state, url }) {
    const users = listUsers(true);
    const me = state.user;

    return (
      <Layout user={me} title="帳號管理">
        {data.message !== null && (
          <div class="alert alert-ok">{data.message}</div>
        )}
        {data.error !== null && (
          <div class="alert alert-error">{data.error}</div>
        )}

        <section class="card">
          <h2 class="card-title">建立帳號</h2>
          <form method="post" class="form-grid">
            <input type="hidden" name="action" value="create" />

            <label class="field">
              <span>帳號</span>
              <input type="text" name="username" required />
            </label>

            <label class="field">
              <span>姓名</span>
              <input type="text" name="name" required />
            </label>

            <label class="field">
              <span>角色</span>
              <select name="role">
                {ROLES.map((role) => (
                  <option value={role}>{ROLE_LABELS[role]}</option>
                ))}
              </select>
            </label>

            <label class="field">
              <span>學號（學生必填）</span>
              <input type="text" name="studentNo" />
            </label>

            <label class="field">
              <span>Email（選填）</span>
              <input type="email" name="email" />
            </label>

            <label class="field">
              <span>初始密碼（留空則同帳號）</span>
              <input type="text" name="password" />
            </label>

            <div class="form-actions">
              <button type="submit" class="btn btn-primary">建立</button>
            </div>
          </form>
        </section>

        <section class="card">
          <h2 class="card-title">帳號列表（{users.length}）</h2>
          <table class="table">
            <thead>
              <tr>
                <th>帳號</th>
                <th>姓名</th>
                <th>角色</th>
                <th>學號</th>
                <th>班級</th>
                <th>狀態</th>
                <th class="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr class={user.isActive ? "" : "row-inactive"}>
                  <td>{user.username}</td>
                  <td>{user.name}</td>
                  <td>{ROLE_LABELS[user.role]}</td>
                  <td>{user.studentNo ?? "-"}</td>
                  <td>{user.className ?? "-"}</td>
                  <td>
                    {user.isActive
                      ? <span class="badge badge-ok">啟用</span>
                      : <span class="badge badge-off">停用</span>}
                  </td>
                  <td class="col-actions">
                    <div class="row-actions">
                      {user.id !== me?.id && (
                        <form method="post">
                          <input
                            type="hidden"
                            name="action"
                            value={user.isActive ? "deactivate" : "activate"}
                          />
                          <input type="hidden" name="userId" value={user.id} />
                          <button type="submit" class="btn btn-sm">
                            {user.isActive ? "停用" : "復用"}
                          </button>
                        </form>
                      )}
                      <form method="post" class="inline-form">
                        <input
                          type="hidden"
                          name="action"
                          value="reset_password"
                        />
                        <input type="hidden" name="userId" value={user.id} />
                        <input
                          type="text"
                          name="newPassword"
                          placeholder="新密碼"
                          class="input-sm"
                          required
                        />
                        <button type="submit" class="btn btn-sm">改密碼</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="muted">目前查詢參數：{url.search || "（無）"}</p>
        </section>
      </Layout>
    );
  },
);

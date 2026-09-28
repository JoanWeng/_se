import { Head } from "fresh/runtime";
import { Layout } from "../components/Layout.tsx";
import { getCurrentSemester } from "../lib/semesters.ts";
import { getOwnStudent } from "../lib/students.ts";
import { ROLE_LABELS } from "../lib/roles.ts";
import { define } from "../utils.ts";

interface Shortcut {
  href: string;
  label: string;
  hint: string;
}

/** 依角色給不同的常用功能捷徑（架構文件：入口頁儀表板） */
const SHORTCUTS: Record<string, Shortcut[]> = {
  admin: [
    { href: "/students", label: "學生資料", hint: "新增、編輯、查詢全校學生" },
    { href: "/classes", label: "班級管理", hint: "班級與導師安排" },
    { href: "/courses", label: "課程管理", hint: "開課與排課" },
    { href: "/grades", label: "成績管理", hint: "登錄與查詢成績" },
    { href: "/semesters", label: "學期管理", hint: "切換目前學期" },
    {
      href: "/admin/users",
      label: "帳號管理",
      hint: "建立帳號、停用、重設密碼",
    },
  ],
  teacher: [
    { href: "/courses", label: "我的課程", hint: "檢視您授課的課程" },
    { href: "/students", label: "班級學生", hint: "查詢自己班級的學生" },
    { href: "/grades", label: "成績簿", hint: "登錄自己授課課程的成績" },
    { href: "/semesters", label: "學期", hint: "目前學期資訊" },
  ],
  student: [
    { href: "/courses", label: "我的課程", hint: "檢視選修的課程" },
    { href: "/students", label: "我的資料", hint: "個人基本資料" },
    { href: "/grades", label: "我的成績", hint: "各學期成績與評語" },
    { href: "/semesters", label: "學期", hint: "目前學期資訊" },
  ],
};

export default define.page(function Home(ctx) {
  const user = ctx.state.user;
  const semester = getCurrentSemester();
  const shortcuts = user === null ? [] : SHORTCUTS[user.role];
  const own = user !== null && user.role === "student"
    ? getOwnStudent(user)
    : null;

  return (
    <Layout user={user} title="首頁">
      <Head>
        <title>校務系統</title>
      </Head>

      <div class="card">
        {user === null ? <p>未登入</p> : (
          <>
            <p>
              歡迎，{user.name}（{ROLE_LABELS[user.role]}）
            </p>
            <p class="muted">
              登入帳號：{user.username}
            </p>
            {own !== null && (
              <p class="muted">
                學號：{own.studentNo}
                {own.className !== null && `　班級：${own.className}`}
              </p>
            )}
          </>
        )}
      </div>

      {semester !== null && (
        <div class="card">
          <h2 class="card-title">目前學期</h2>
          <p>
            <strong>{semester.name}</strong>
            <span class="muted">
              {semester.startDate} ~ {semester.endDate}
            </span>
          </p>
        </div>
      )}

      {shortcuts.length > 0 && (
        <section class="card">
          <h2 class="card-title">常用功能</h2>
          <div class="shortcut-grid">
            {shortcuts.map((item) => (
              <a key={item.href} class="shortcut" href={item.href}>
                <span class="shortcut-label">{item.label}</span>
                <span class="muted">{item.hint}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <div class="card">
        <h2 class="card-title">系統狀態</h2>
        <ul class="plain-list">
          <li>
            已完成：帳號與權限、學期、班級、課程、學生資料、成績登錄與查詢
          </li>
          <li>進行中：CSV 匯出</li>
          <li>尚未實作：公告通知、CSV 匯出、部署</li>
        </ul>
      </div>
    </Layout>
  );
});

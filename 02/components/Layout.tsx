import { type ComponentChildren } from "preact";
import type { AuthUser } from "../lib/auth-types.ts";
import { ROLE_LABELS } from "../lib/roles.ts";

interface NavItem {
  href: string;
  label: string;
}

const NAV_ITEMS: Record<AuthUser["role"], NavItem[]> = {
  admin: [
    { href: "/", label: "首頁" },
    { href: "/semesters", label: "學期" },
    { href: "/classes", label: "班級" },
    { href: "/courses", label: "課程" },
    { href: "/students", label: "學生" },
    { href: "/grades", label: "成績" },
    { href: "/admin/users", label: "帳號" },
  ],
  teacher: [
    { href: "/", label: "首頁" },
    { href: "/courses", label: "我的課程" },
    { href: "/students", label: "班級學生" },
    { href: "/grades", label: "成績簿" },
    { href: "/semesters", label: "學期" },
  ],
  student: [
    { href: "/", label: "首頁" },
    { href: "/courses", label: "我的課程" },
    { href: "/students", label: "我的資料" },
    { href: "/grades", label: "我的成績" },
    { href: "/semesters", label: "學期" },
  ],
};

interface LayoutProps {
  user: AuthUser | null;
  title: string;
  children: ComponentChildren;
}

export function Layout({ user, title, children }: LayoutProps) {
  const items = user === null ? [] : NAV_ITEMS[user.role];

  return (
    <div class="app">
      <header class="app-header">
        <a class="brand" href="/">校務系統</a>
        {items.length > 0 && (
          <nav class="app-nav">
            {items.map((item) => (
              <a key={item.href} href={item.href}>{item.label}</a>
            ))}
          </nav>
        )}
        {user !== null && (
          <div class="app-user">
            <span class="app-user-name">
              {user.name}
              <span class="badge">{ROLE_LABELS[user.role]}</span>
            </span>
            <form method="post" action="/logout">
              <button type="submit" class="btn btn-ghost">登出</button>
            </form>
          </div>
        )}
      </header>
      <main class="app-main">
        <h1 class="page-title">{title}</h1>
        {children}
      </main>
    </div>
  );
}

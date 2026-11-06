const TOKEN_KEY = "admin_token";

let token = null;
let adminPage = 1;
let bannedSet = new Set();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function api(path, options) {
  const res = await fetch(path, options);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function authOptions(options = {}) {
  return {
    ...options,
    headers: {
      ...(options.headers || {}),
      authorization: `Bearer ${token}`,
    },
  };
}

function showPanel() {
  document.getElementById("login-section").hidden = true;
  document.getElementById("panel").hidden = false;
}

function showLogin(message) {
  token = null;
  sessionStorage.removeItem(TOKEN_KEY);
  document.getElementById("login-section").hidden = false;
  document.getElementById("panel").hidden = true;
  document.getElementById("login-error").textContent = message || "";
}

function fmtTime(utc) {
  const ts = Date.parse(utc.includes("T") ? utc : `${utc}Z`);
  if (Number.isNaN(ts)) return utc;
  return new Date(ts).toLocaleString("zh-TW", { hour12: false });
}

async function loadMessages(page) {
  const data = await api(`/api/admin/messages?page=${page}`, authOptions());
  adminPage = Math.min(data.page, data.maxPage);
  const list = document.getElementById("msg-list");
  list.replaceChildren();
  if (data.items.length === 0) list.append(el("li", "empty", "目前沒有留言"));
  data.items.forEach((item) => list.append(renderMessage(item)));
  renderPager(page, data.maxPage, loadMessages);
}

function renderMessage(item) {
  const li = el("li");

  const meta = el("div", "meta");
  const left = el("div");
  left.append(
    el("span", "name", `#${item.id}`),
    el("span", "name", item.name),
    el("span", "ip", item.ip),
  );
  const btns = el("div");

  const banBtn = el("button", "secondary", "封鎖 IP");
  banBtn.type = "button";
  banBtn.disabled = bannedSet.has(item.ip);
  banBtn.addEventListener("click", () => banIp(item.ip, ""));
  btns.append(banBtn);

  const delBtn = el("button", "secondary", "刪除");
  delBtn.type = "button";
  delBtn.addEventListener("click", () => adminDelete(item.id));
  btns.append(delBtn);

  meta.append(left, btns);
  li.append(meta);
  li.append(el("div", "content", item.content));
  li.append(el("div", "meta", fmtTime(item.created_at)));
  return li;
}

function renderPager(current, max, go) {
  const pager = document.getElementById("msg-pager");
  pager.replaceChildren();
  if (max <= 1) return;
  const prev = el("button", null, "‹");
  prev.type = "button";
  prev.disabled = current <= 1;
  prev.addEventListener("click", () => go(current - 1));
  const next = el("button", null, "›");
  next.type = "button";
  next.disabled = current >= max;
  next.addEventListener("click", () => go(current + 1));
  pager.append(prev, el("span", "page-label", `${current} / ${max}`), next);
}

async function refreshAll() {
  await Promise.all([loadBanned(), loadMessages(adminPage)]);
}

async function adminDelete(id) {
  if (!confirm(`確定刪除留言 #${id}？`)) return;
  try {
    await api(`/api/admin/messages/${id}`, authOptions({ method: "DELETE" }));
    await loadMessages(adminPage);
  } catch (err) {
    handleApiError(err, () => adminDelete(id));
  }
}

async function banIp(ip, reason) {
  try {
    await api("/api/admin/ban", authOptions({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip, reason }),
    }));
    await refreshAll();
  } catch (err) {
    handleApiError(err, () => banIp(ip, reason));
  }
}

async function unbanIp(ip) {
  if (!confirm(`解除封鎖 ${ip}？`)) return;
  try {
    await api(`/api/admin/ban/${encodeURIComponent(ip)}`, authOptions({ method: "DELETE" }));
    await refreshAll();
  } catch (err) {
    handleApiError(err, () => unbanIp(ip));
  }
}

function handleApiError(err, retry) {
  if (err.message === "unauthorized") {
    showLogin("登入已過期，請重新登入");
  } else {
    alert(err.message);
  }
}

async function loadBanned() {
  const data = await api("/api/admin/banned", authOptions());
  bannedSet = new Set(data.items.map((item) => item.ip));
  const tbody = document.getElementById("ban-list");
  tbody.replaceChildren();
  if (data.items.length === 0) {
    const tr = document.createElement("tr");
    const td = el("td", "empty", "目前沒有封鎖任何 IP");
    td.colSpan = 4;
    tr.append(td);
    tbody.append(tr);
  }
  data.items.forEach((item) => {
    const tr = document.createElement("tr");
    tr.append(
      el("td", null, item.ip),
      el("td", null, item.reason || "-"),
      el("td", null, fmtTime(item.created_at)),
    );
    const td = document.createElement("td");
    const btn = el("button", "secondary", "解除");
    btn.type = "button";
    btn.addEventListener("click", () => unbanIp(item.ip));
    td.append(btn);
    tr.append(td);
    tbody.append(tr);
  });
}

async function login(password) {
  const data = await api("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  token = data.token;
  sessionStorage.setItem(TOKEN_KEY, token);
  showPanel();
  await refreshAll();
}

document.getElementById("login-btn").addEventListener("click", async () => {
  const password = document.getElementById("admin-password").value;
  try {
    await login(password);
  } catch (err) {
    document.getElementById("login-error").textContent = err.message;
  }
});

document.getElementById("admin-password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("login-btn").click();
});

document.getElementById("ban-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ip = document.getElementById("ban-ip").value.trim();
  const reason = document.getElementById("ban-reason").value.trim();
  if (!ip) return;
  await banIp(ip, reason);
  e.target.reset();
});

window.addEventListener("DOMContentLoaded", async () => {
  const saved = sessionStorage.getItem(TOKEN_KEY);
  if (!saved) return;
  token = saved;
  showPanel();
  try {
    await refreshAll();
  } catch (err) {
    if (err.message === "unauthorized") {
      showLogin("登入已過期，請重新登入");
    } else {
      showLogin("");
    }
  }
});

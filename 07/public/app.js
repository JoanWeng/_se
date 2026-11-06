const form = document.getElementById("form");
const listEl = document.getElementById("list");
const pagerEl = document.getElementById("pager");
const totalEl = document.getElementById("total");
const errorEl = document.getElementById("form-error");

let currentPage = 1;
let nameInput, passwordInput, contentInput;

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

function renderMessage(item, floor) {
  const li = el("li");

  const meta = el("div", "meta");
  const left = el("div");
  left.append(el("span", "name", `${floor} 樓`), el("span", "name", item.name));
  meta.append(left);
  const del = el("button", "secondary", "刪除");
  del.type = "button";
  del.addEventListener("click", () => deleteMessage(item.id));
  meta.append(del);
  li.append(meta);

  li.append(el("div", "content", item.content));

  const time = el("div", "meta", fmtTime(item.created_at));
  li.append(time);

  return li;
}

async function deleteMessage(id) {
  const password = prompt("請輸入留言時設定的密碼：");
  if (!password) return;
  try {
    await api(`/api/messages/${id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    await loadPage(currentPage);
  } catch (err) {
    alert(err.message);
  }
}

function fmtTime(utc) {
  const ts = Date.parse(utc.includes("T") ? utc : `${utc}Z`);
  if (Number.isNaN(ts)) return utc;
  return new Date(ts).toLocaleString("zh-TW", { hour12: false });
}

function renderPager(maxPage) {
  pagerEl.replaceChildren();
  const around = 2;
  const pages = new Set(
    [1, maxPage].concat(
      Array.from({ length: around * 2 + 1 }, (_, i) => currentPage - around + i),
    ).filter((p) => p >= 1 && p <= maxPage),
  );
  [...pages].sort((a, b) => a - b).forEach((p) => {
    const btn = el("button", null, String(p));
    btn.type = "button";
    if (p === currentPage) btn.setAttribute("aria-current", "page");
    btn.addEventListener("click", () => loadPage(p));
    pagerEl.append(btn);
  });
}

async function loadPage(page) {
  try {
    const data = await api(`/api/messages?page=${page}`);
    currentPage = Math.min(data.page, data.maxPage);
    listEl.replaceChildren();
    if (data.items.length === 0) {
      listEl.append(el("li", "empty", "還沒有留言，來寫第一則吧！"));
    } else {
      data.items.forEach((item, i) => {
        const floor = data.total - (currentPage - 1) * 20 - i;
        listEl.append(renderMessage(item, floor));
      });
    }
    totalEl.textContent = `共 ${data.total} 則`;
    renderPager(data.maxPage);
  } catch (err) {
    listEl.replaceChildren(el("li", "empty", `載入失敗：${err.message}`));
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  nameInput = nameInput || document.getElementById("name");
  passwordInput = passwordInput || document.getElementById("password");
  contentInput = contentInput || document.getElementById("content");
  errorEl.textContent = "";
  try {
    await api("/api/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: nameInput.value,
        password: passwordInput.value,
        content: contentInput.value,
      }),
    });
    form.reset();
    await loadPage(1);
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

loadPage(1);

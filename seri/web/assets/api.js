// Shared helpers. Every state-changing request carries the CSRF header the server requires.
export async function api(path, { method = "GET", json, form } = {}) {
  const opts = { method, headers: {}, credentials: "same-origin" };
  if (method !== "GET") opts.headers["X-Seri-CSRF"] = "1";
  if (json !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(json); }
  if (form) opts.body = form;
  const res = await fetch(path, opts);
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : null;
  if (!res.ok) {
    const d = data && data.detail;
    const err = new Error(typeof d === "string" ? d : (d && d.message) || (Array.isArray(d) ? "入力内容を確認してください" : "エラーが起きました"));
    err.reasons = d && d.reasons;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const yen = (n) => "¥" + Number(n).toLocaleString("ja-JP");
export const $ = (sel, root = document) => root.querySelector(sel);

export function show(el, text, ok = true) {
  el.hidden = !text;
  el.className = "msg " + (ok ? "ok" : "err");
  el.textContent = text || "";
}

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const k of kids) e.append(k instanceof Node ? k : document.createTextNode(String(k ?? "")));
  return e;
}

export async function requireUser(roles) {
  try {
    const me = await api("/api/me");
    if (roles && !roles.includes(me.role)) { location.href = "/app/"; return null; }
    if ($("#shell")) shell(me);
    return me;
  } catch { location.href = "/app/login.html?next=" + encodeURIComponent(location.pathname); return null; }
}

export async function logout() { await api("/api/auth/logout", { method: "POST" }); location.href = "/"; }

// Header with the pages each role can use. `active` is the current page's path.
const NAV = {
  creator: [["/app/creator.html", "ホーム"], ["/app/assets.html", "資産と収入"], ["/app/account.html", "アカウント"]],
  buyer: [["/app/buyer.html", "注文"], ["/app/catalog.html", "カタログ"], ["/app/account.html", "アカウント"]],
  reviewer: [["/app/review.html", "審査"], ["/app/account.html", "アカウント"]],
  admin: [["/app/admin.html", "運営"], ["/app/review.html", "審査"], ["/app/account.html", "アカウント"]],
};
export function shell(me) {
  const header = $("#shell");
  const who = me.role === "buyer" && me.org ? `${me.org} · ${me.name}` : me.name;
  header.replaceChildren(
    el("a", { class: "brand", href: "/" }, "Seri", el("span", {}, ".")),
    el("nav", { class: "nav", "aria-label": "メニュー" }, ...NAV[me.role].map(([href, label]) =>
      el("a", { href, ...(location.pathname === href ? { "aria-current": "page" } : {}) }, label))),
    el("div", { class: "row" }, el("span", { class: "muted" }, who),
      el("button", { type: "button", class: "secondary small", onclick: logout }, "ログアウト")),
  );
}

export const statusLabel = {
  awaiting_payment: ["入金待ち", "wait"], open: ["募集中", "good"], filled: ["完了", ""], closed: ["終了（返金済み）", ""],
  cancelled: ["キャンセル", ""], pending: ["審査中", "wait"], approved: ["合格", "good"], rejected: ["不合格", "bad"],
};
export const disputeLabel = { open: ["対応待ち", "wait"], upheld: ["返金済み", "bad"], rejected: ["問題なしと判断", ""] };

export const date = (iso) => iso ? new Date(iso).toLocaleDateString("ja-JP", { month: "short", day: "numeric" }) : "—";
export const pct = (x) => x == null ? "—" : Math.round(x * 100) + "%";

// Rank as people say it: "上位12%" (percentile 0.88 = better than 88%)
export const rankText = (p) => p == null ? "まだ順位なし（審査5件から）" : `上位${Math.max(1, Math.round((1 - p) * 100))}%`;

export function downloadJson(obj, name) {
  const a = el("a", { href: URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" })), download: name });
  document.body.append(a); a.click(); a.remove();
}

// A progress bar whose width is set through the CSSOM (the page CSP forbids inline style attributes)
export function bar(fraction, kind = "") {
  const fill = el("i", { class: kind });
  fill.style.width = Math.round(Math.min(1, Math.max(0, fraction)) * 100) + "%";
  return el("div", { class: "meter", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100",
                     "aria-valuenow": String(Math.round(fraction * 100)) }, fill);
}
export function pill([text, kind]) { return el("span", { class: "pill " + (kind || "") }, text); }

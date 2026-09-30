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
    return me;
  } catch { location.href = "/app/login.html?next=" + encodeURIComponent(location.pathname); return null; }
}

export async function logout() { await api("/api/auth/logout", { method: "POST" }); location.href = "/"; }

export const statusLabel = {
  awaiting_payment: ["入金待ち", "wait"], open: ["募集中", "good"], filled: ["完了", ""],
  pending: ["審査中", "wait"], approved: ["合格", "good"], rejected: ["不合格", "bad"],
};
export function pill([text, kind]) { return el("span", { class: "pill " + (kind || "") }, text); }

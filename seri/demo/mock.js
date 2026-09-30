// Demo-mode stand-in for the Seri API: answers from a snapshot of real server responses.
// Nothing is saved. Used only by the demo build (seri/demo/build_demo.py).
import { SNAP } from "./snapshot.js";

export const DEMO_MESSAGE = "デモ版なので保存されません。本番ではこの操作がそのまま動きます。";
const DEFAULT_PERSONA = { creator: "hanako", buyer: "buyer", reviewer: "reviewer", admin: "admin" };

export function getPersona() {
  try { return localStorage.getItem("seri-demo-persona") || ""; } catch { return ""; }
}
export function setPersona(p) {
  try { localStorage.setItem("seri-demo-persona", p); } catch { /* the page still works with the default persona */ }
}
export function personaFor(roles) {
  const p = getPersona();
  if (p && SNAP.personas[p] && (!roles || roles.includes(SNAP.personas[p]["/api/me"].role))) return p;
  return DEFAULT_PERSONA[(roles && roles[0]) || "creator"];
}

const clone = (x) => JSON.parse(JSON.stringify(x));

function quote(b) {
  const m = SNAP.public["/api/meta"];
  const cat = m.categories[b.category], tier = m.tiers[b.tier], ind = m.industries[b.industry];
  if (!cat || !tier || !ind) throw new Error("入力内容を確認してください");
  if (!(b.units >= 1 && b.units <= 100000)) throw new Error("件数は1〜100,000件で指定してください");
  if (!(b.unit_price_jpy >= cat.floor_jpy && b.unit_price_jpy <= 1000000))
    throw new Error(`1件あたりの価格は${cat.floor_jpy.toLocaleString()}円以上にしてください（最低価格）`);
  const total = Math.round(b.units * b.unit_price_jpy * ind.multiplier * tier.multiplier);
  const promo = b.promoted ? m.promo_fee_jpy : 0;
  return { ...b, tier_multiplier: tier.multiplier, industry_multiplier: ind.multiplier, total_jpy: total,
           promo_fee_jpy: promo, invoice_jpy: total + promo, deadline_days: tier.days,
           creator_unit_jpy: Math.floor(Math.floor(total / b.units) * 90 / 100), floor_jpy: cat.floor_jpy };
}

export async function mockApi(path, { method = "GET", json } = {}, roles) {
  const url = new URL(path, "https://demo.invalid");
  const p = url.pathname, q = url.searchParams;
  if (method !== "GET") {
    if (p === "/api/quote") return quote(json);
    if (p === "/api/auth/logout") return { ok: true };
    throw Object.assign(new Error(DEMO_MESSAGE), { status: 400 });
  }
  if (SNAP.public[p]) return clone(SNAP.public[p]);
  const snap = SNAP.personas[personaFor(roles)];
  if (p === "/api/catalog") {
    const all = snap.catalog[q.get("category")] || [];
    return clone(all.filter((i) => (!q.get("grade") || i.grade === q.get("grade")) && (!q.get("industry") || i.industry === q.get("industry"))));
  }
  if (p === "/api/admin/leaderboard") return clone(snap.leaderboard[`${q.get("category")}|${q.get("industry") || ""}`] || []);
  if (p === "/api/admin/users") return clone(snap[`${p}?role=${q.get("role")}`] || []);
  if (snap[p] !== undefined) return clone(snap[p]);
  throw Object.assign(new Error("このデモには入っていない画面です"), { status: 404 });
}

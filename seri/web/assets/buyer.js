import { api, $, show, el, yen, requireUser, logout, statusLabel, pill } from "/assets/api.js";

const me = await requireUser(["buyer"]);
if (me) {
  $("#who").textContent = me.org ? `${me.org} · ${me.name}` : me.name;
  $("#logout").onclick = logout;
  const meta = await api("/api/meta");
  const fill = (sel, entries, label) => { for (const [k, v] of entries) $(sel).append(el("option", { value: k }, label(k, v))); };
  fill("#category", Object.entries(meta.categories), (k, v) => `${v.label}（最低 ${yen(v.floor_jpy)}）`);
  fill("#tier", Object.entries(meta.tiers), (k, v) => `${v.label} ×${v.multiplier}`);
  fill("#industry", Object.entries(meta.industries), (k, v) => `${v.label} ×${v.multiplier}`);
  fill("#license", Object.entries(meta.licenses), (k, v) => v);

  const form = $("#order"), msg = $("#msg");
  const body = () => {
    const f = new FormData(form);
    return { category: f.get("category"), units: Number(f.get("units")), unit_price_jpy: Number(f.get("unit_price_jpy")),
             tier: f.get("tier"), industry: f.get("industry"), license: f.get("license"), instructions: f.get("instructions") };
  };
  let timer;
  async function requote() {
    const b = body();
    try {
      const q = await api("/api/quote", { method: "POST", json: { ...b, instructions: undefined } });
      $("#total").textContent = yen(q.total_jpy);
      $("#formula").textContent = `${q.units.toLocaleString()}件 × ${yen(q.unit_price_jpy)} × 業界 ${q.industry_multiplier} × 順位 ${q.tier_multiplier}`;
      show(msg, "");
    } catch (err) { $("#total").textContent = "—"; $("#formula").textContent = err.message; }
  }
  form.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(requote, 250); });
  requote();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const o = await api("/api/orders", { method: "POST", json: body() });
      show(msg, `注文 #${o.id}（${yen(o.total_jpy)}）を受け付けました。請求書をお送りします。`);
      load();
    } catch (err) { show(msg, err.message, false); }
  });

  async function load() {
    const rows = await api("/api/orders/mine");
    const tb = $("#orders");
    tb.replaceChildren(...rows.map((o) => el("tr", {},
      el("td", {}, o.id),
      el("td", {}, `${o.category_label} · ${o.tier_label} · ${o.industry_label}`, el("br"), el("span", { class: "muted" }, o.license_label)),
      el("td", { class: "num" }, `${o.approved} / ${o.units}`),
      el("td", { class: "num" }, yen(o.total_jpy)),
      el("td", {}, pill(statusLabel[o.status] || [o.status])),
      el("td", {}, o.approved ? el("a", { href: `/api/orders/${o.id}/datacard`, target: "_blank", rel: "noopener" }, "データカード") : "—"),
    )));
    if (!rows.length) tb.append(el("tr", {}, el("td", { colspan: 6, class: "muted" }, "まだ注文はありません")));
  }
  load();
}

import { api, $, show, el, yen, requireUser, logout, statusLabel, pill } from "/assets/api.js";

const me = await requireUser(["reviewer", "admin"]);
if (me) {
  $("#who").textContent = `${me.name}（${me.role === "admin" ? "運営" : "レビュアー"}）`;
  $("#logout").onclick = logout;
  const msg = $("#msg");

  async function loadQueue() {
    const q = await api("/api/review/queue");
    $("#queue").replaceChildren(...(q.length ? q.map((s) => {
      const m = s.checks.metrics || {};
      const reason = el("input", { placeholder: "不合格の理由（クリエイターに届きます）", maxlength: "500" });
      const decide = async (decision) => {
        try { await api(`/api/review/${s.id}`, { method: "POST", json: { decision, reason: reason.value } }); show(msg, `#${s.id} を${decision === "approve" ? "合格" : "不合格"}にしました`); loadQueue(); loadAdmin(); }
        catch (err) { show(msg, err.message, false); }
      };
      return el("div", { class: "card" },
        el("div", { class: "row" }, pill([s.category, ""]), el("span", { class: "muted" }, `提出 #${s.id} · 注文 #${s.order_id}`)),
        el("p", {}, s.instructions || "（指示なし）"),
        el("audio", { controls: "", preload: "none", src: `/api/review/${s.id}/audio` }),
        el("p", { class: "muted num" }, `${m.duration_sec}秒 · 平均 ${m.level_dbfs} dBFS · 無音 ${Math.round((m.silence_ratio || 0) * 100)}% · 音割れ ${((m.clip_ratio || 0) * 100).toFixed(2)}%`),
        reason,
        el("div", { class: "row" },
          el("button", { type: "button", class: "accent", onclick: () => decide("approve") }, "合格"),
          el("button", { type: "button", class: "secondary", onclick: () => decide("reject") }, "不合格")),
      );
    }) : [el("p", { class: "muted" }, "審査待ちはありません")]));
  }

  async function loadAdmin() {
    if (me.role !== "admin") return;
    $("#admin").hidden = false;
    const [orders, wl] = await Promise.all([api("/api/admin/orders"), api("/api/admin/waitlist")]);
    $("#orders").replaceChildren(...orders.map((o) => el("tr", {},
      el("td", {}, o.id), el("td", {}, `${o.category_label} · ${o.tier_label} · ${o.industry_label}`),
      el("td", { class: "num" }, `${o.approved} / ${o.units}`), el("td", { class: "num" }, yen(o.total_jpy)),
      el("td", {}, pill(statusLabel[o.status] || [o.status])),
      el("td", {}, o.status === "awaiting_payment" ? el("button", { type: "button", class: "secondary", onclick: async () => {
        try { await api(`/api/admin/orders/${o.id}/mark-paid`, { method: "POST" }); show(msg, `注文 #${o.id} の入金を記録しました。募集を始めます。`); loadAdmin(); }
        catch (err) { show(msg, err.message, false); } } }, "入金を記録") : ""),
    )));
    $("#waitlist").replaceChildren(...wl.map((w) => el("tr", {}, el("td", {}, w.email), el("td", {}, w.role === "creator" ? "クリエイター" : "企業"), el("td", {}, w.note))));
  }
  $("#release").onclick = async () => { const r = await api("/api/admin/release-holds", { method: "POST" }); show(msg, `${r.released}件の保留を確定しました`); };
  $("#check").onclick = async () => { const r = await api("/api/admin/ledger/check"); show(msg, r.balanced ? "台帳は1円のずれもなく一致しています" : "台帳にずれがあります: " + r.unbalanced_groups.join(", "), r.balanced); };
  loadQueue(); loadAdmin();
}

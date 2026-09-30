import { api, $, show, el, yen, requireUser, statusLabel, disputeLabel, pill, date, pct } from "/assets/api.js";

const me = await requireUser(["admin"]);
if (me) {
  const meta = await api("/api/meta");
  const msg = $("#msg");
  const act = async (fn, okText) => { try { const r = await fn(); show(msg, okText(r)); loadAll(); } catch (err) { show(msg, err.message, false); } };
  const empty = (cols, text) => [el("tr", {}, el("td", { colspan: cols, class: "muted" }, text))];

  async function loadKpis() {
    const k = await api("/api/admin/kpis");
    const tile = (label, value) => el("div", {}, el("span", { class: "muted" }, label), el("b", {}, value));
    $("#kpis").replaceChildren(
      tile("取引額", yen(k.gmv_jpy)), tile("作った人へ", yen(k.paid_to_creators_jpy)), tile("Seriの収益", yen(k.seri_revenue_jpy)),
      tile("預かり金", yen(k.escrow_jpy)), tile("印税の販売", `${k.royalty_sales}件`), tile("クリエイター", `${k.creators}人`),
      tile("企業", `${k.buyers}社`), tile("入金待ち", `${k.awaiting_payment}件`), tile("募集中", `${k.open_orders}件`),
      tile("審査待ち", `${k.pending_reviews}件`), tile("報告の対応待ち", `${k.open_disputes}件`));
    const s = (x) => `${x.month}: 活動 ${x.active}人中 ${x.reached_30k}人が月3万円以上（${pct(x.rate)}）`;
    $("#success").textContent = `成功率（目標80%）— ${s(k.success_this_month)} / ${s(k.success_last_month)}`;
  }

  async function loadOrders() {
    const rows = await api("/api/admin/orders");
    $("#orders").replaceChildren(...(rows.length ? rows.map((o) => el("tr", {},
      el("td", {}, o.id), el("td", {}, o.buyer),
      el("td", {}, o.kind === "catalog" ? `カタログ · ${o.category_label}` : `${o.category_label} · ${o.tier_label} · ${o.industry_label}`,
        o.promoted ? el("span", {}, " ", pill(["注目", "feat"])) : "", el("br"),
        el("span", { class: "muted" }, `${o.license_label} · ${o.fallback_label}${o.deadline_at ? " · 締切 " + date(o.deadline_at) : ""}`)),
      el("td", { class: "num" }, `${o.delivered} / ${o.units}`),
      el("td", { class: "num" }, yen(o.invoice_jpy), o.refunded_jpy ? el("span", { class: "muted" }, el("br"), `返金 ${yen(o.refunded_jpy)}`) : ""),
      el("td", {}, pill(statusLabel[o.status] || [o.status])),
      el("td", {}, o.status === "awaiting_payment" ? el("button", { type: "button", class: "secondary small", onclick: () => {
        if (confirm(`注文 #${o.id} の入金（${yen(o.invoice_jpy)}）を確認しましたか？`))
          act(() => api(`/api/admin/orders/${o.id}/mark-paid`, { method: "POST" }),
            (r) => r.kind === "catalog" ? `注文 #${o.id}: ${r.sold}件を納品しました${r.refunded ? `（${r.refunded}件は販売終了のため返金）` : ""}` : `注文 #${o.id} の入金を記録しました。募集を始めます。`);
      } }, "入金を記録") : ""),
    )) : empty(7, "注文はまだありません")));
  }

  function disputeCard(d) {
    const note = el("input", { placeholder: "判断の理由（記録に残ります）", maxlength: "500", "aria-label": "判断の理由" });
    const decide = (decision) => act(() => api(`/api/admin/disputes/${d.id}`, { method: "POST", json: { decision, note: note.value } }),
      (r) => r.status === "upheld" ? `返金しました（保留分から${yen(r.from_creator_jpy)}、Seri負担${yen(r.from_seri_jpy)}）` : "問題なしと判断しました");
    return el("div", { class: "card" },
      el("div", { class: "row" }, pill(disputeLabel[d.status]), el("span", { class: "muted" }, `${d.buyer} · 注文 #${d.order_id} · データ #${d.asset.id}（${d.asset.grade}） · ${date(d.created_at)}`)),
      el("p", {}, d.reason),
      el("audio", { controls: "", preload: "none", src: d.audio }),
      el("p", { class: "muted num" }, `価格 ${yen(d.amount_jpy)} · 作った人の保留分 ${yen(d.held_jpy)}`),
      d.status === "open"
        ? el("div", { class: "inline-form" }, note,
            el("button", { type: "button", class: "accent small", onclick: () => decide("uphold") }, "認めて返金"),
            el("button", { type: "button", class: "secondary small", onclick: () => decide("reject") }, "問題なし"))
        : el("p", { class: "muted" }, `判断: ${d.resolution}`));
  }

  async function loadPeople() {
    const [creators, buyers, disputes, wl, log] = await Promise.all([api("/api/admin/users?role=creator"), api("/api/admin/users?role=buyer"),
      api("/api/admin/disputes"), api("/api/admin/waitlist"), api("/api/admin/audit")]);
    $("#disputes").replaceChildren(...(disputes.length ? disputes.map(disputeCard) : [el("p", { class: "muted" }, "報告はありません")]));
    $("#creators").replaceChildren(...(creators.length ? creators.map((u) => {
      const state = u.deletion_requested ? pill(["削除の依頼あり", "bad"]) : u.suspended ? pill(["停止中", "bad"]) : pill(["有効", "good"]);
      return el("tr", {},
        el("td", {}, u.id), el("td", {}, u.name, el("br"), el("span", { class: "muted" }, u.email)),
        el("td", {}, u.industry ? `${u.industry_label} ` : "—",
          u.industry && !u.industry_verified ? el("button", { type: "button", class: "secondary small", onclick: () => {
            if (confirm(`${u.name} さんの職種（${u.industry_label}）を、資格や職歴の書類で確認しましたか？`))
              act(() => api(`/api/admin/users/${u.id}/verify-industry`, { method: "POST" }), () => `${u.name} さんの職種を確認済みにしました`);
          } }, "確認済みにする") : u.industry ? pill(["確認済み", "good"]) : ""),
        el("td", {}, u.level_label), el("td", { class: "num" }, u.approved), el("td", { class: "num" }, pct(u.a_rate)),
        el("td", { class: "num" }, u.buyers), el("td", {}, state),
        el("td", {}, el("button", { type: "button", class: "secondary small", onclick: () => {
          if (confirm(u.suspended ? `${u.name} さんの停止を解除しますか？` : `${u.name} さんを停止しますか？ 新しい仕事を受けられなくなり、データはカタログから外れます。`))
            act(() => api(`/api/admin/users/${u.id}/suspend`, { method: "POST", json: { suspended: !u.suspended } }), () => "更新しました");
        } }, u.suspended ? "停止を解除" : "停止する")));
    }) : empty(9, "クリエイターはまだいません")));
    $("#buyers").replaceChildren(...(buyers.length ? buyers.map((u) => el("tr", {},
      el("td", {}, u.id), el("td", {}, u.org || "—"), el("td", {}, u.name), el("td", {}, u.email), el("td", {}, date(u.created_at)))) : empty(5, "企業はまだいません")));
    $("#waitlist").replaceChildren(...(wl.length ? wl.map((w) => el("tr", {},
      el("td", {}, w.email), el("td", {}, w.role === "creator" ? "クリエイター" : "企業"), el("td", {}, w.note), el("td", {}, date(w.at)))) : empty(4, "申し込みはまだありません")));
    $("#audit").replaceChildren(...log.map((r) => el("tr", {},
      el("td", { class: "num" }, new Date(r.at).toLocaleString("ja-JP")), el("td", {}, r.actor), el("td", {}, r.action), el("td", {}, r.target), el("td", { class: "muted" }, r.ip))));
  }

  for (const [k, v] of Object.entries(meta.categories)) $("#lb-category").append(el("option", { value: k }, v.label));
  for (const [k, v] of Object.entries(meta.industries)) $("#lb-industry").append(el("option", { value: k }, k ? v.label : "全体"));
  async function loadLeaderboard() {
    const f = new FormData($("#lb-filters"));
    const rows = await api("/api/admin/leaderboard?" + new URLSearchParams({ category: f.get("category"), industry: f.get("industry") }));
    $("#leaderboard").replaceChildren(...(rows.length ? rows.map((r, i) => el("tr", {},
      el("td", {}, r.ranked ? i + 1 : "—"), el("td", {}, r.name), el("td", {}, r.industry_label || "—"),
      el("td", { class: "num" }, Math.round(r.score * 100)), el("td", { class: "num" }, r.reviewed))) : empty(5, "まだ誰も審査を受けていません")));
  }
  $("#lb-filters").addEventListener("change", loadLeaderboard);

  $("#deadlines").onclick = () => act(() => api("/api/admin/process-deadlines", { method: "POST" }),
    (r) => r.results.length ? `${r.results.length}件の注文を処理しました` : "締切を過ぎた注文はありません");
  $("#release").onclick = () => act(() => api("/api/admin/release-holds", { method: "POST" }), (r) => `${r.released}件の保留を確定しました`);
  $("#check").onclick = async () => {
    const r = await api("/api/admin/ledger/check");
    show(msg, r.balanced ? "台帳は1円のずれもなく一致しています" : "台帳にずれがあります: " + r.unbalanced_groups.join(", "), r.balanced);
  };

  function loadAll() { loadKpis(); loadOrders(); loadPeople(); loadLeaderboard(); }
  loadAll();
}

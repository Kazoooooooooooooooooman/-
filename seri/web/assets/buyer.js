import { api, $, show, el, yen, requireUser, statusLabel, disputeLabel, pill, date } from "/assets/api.js";

const me = await requireUser(["buyer"]);
if (me) {
  const meta = await api("/api/meta");
  const fill = (sel, entries, label) => { for (const [k, v] of entries) $(sel).append(el("option", { value: k }, label(k, v))); };
  fill("#category", Object.entries(meta.categories), (k, v) => `${v.label}（最低 ${yen(v.floor_jpy)}）`);
  fill("#tier", Object.entries(meta.tiers), (k, v) => `${v.label} ×${v.multiplier}`);
  fill("#industry", Object.entries(meta.industries), (k, v) => `${v.label} ×${v.multiplier}`);
  fill("#license", Object.entries(meta.licenses), (k, v) => v.label);
  fill("#fallback", Object.entries(meta.fallbacks), (k, v) => v);
  $("#promo-label").textContent = `注文を目立たせる（+${yen(meta.promo_fee_jpy)}）: クリエイターの仕事一覧の先頭に表示します。品質の審査と価格には影響しません。`;

  const form = $("#order"), msg = $("#msg");
  const body = () => {
    const f = new FormData(form);
    return { category: f.get("category"), units: Number(f.get("units")), unit_price_jpy: Number(f.get("unit_price_jpy")),
             tier: f.get("tier"), industry: f.get("industry"), license: f.get("license"), fallback: f.get("fallback"),
             promoted: $("#promoted").checked, instructions: f.get("instructions") };
  };
  let timer;
  async function requote() {
    const { instructions, ...b } = body();
    try {
      const q = await api("/api/quote", { method: "POST", json: b });
      $("#total").textContent = yen(q.invoice_jpy);
      $("#formula").textContent = `${q.units.toLocaleString()}件 × ${yen(q.unit_price_jpy)} × 業界 ${q.industry_multiplier} × 順位 ${q.tier_multiplier} = ${yen(q.total_jpy)}`
        + (q.promo_fee_jpy ? ` ＋ 目立たせる ${yen(q.promo_fee_jpy)}` : "");
      $("#terms").textContent = `締切の目安: 入金から${q.deadline_days}日 · 作った人の取り分: 1件あたり約${yen(q.creator_unit_jpy)}（90%）`;
      show(msg, "");
    } catch (err) { $("#total").textContent = "—"; $("#formula").textContent = err.message; $("#terms").textContent = ""; }
  }
  form.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(requote, 250); });
  requote();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const o = await api("/api/orders", { method: "POST", json: body() });
      show(msg, `注文 #${o.id}（お支払い ${yen(o.invoice_jpy)}）を受け付けました。請求書をお送りします。`);
      load();
    } catch (err) { show(msg, err.message, false); }
  });

  async function showDetail(o) {
    const card = await api(`/api/orders/${o.id}/datacard`);
    $("#detail").hidden = false;
    $("#detail-title").textContent = `注文 #${o.id} · ${o.kind_label} · ${o.category_label}`;
    $("#detail-kpis").replaceChildren(
      el("div", {}, el("span", { class: "muted" }, "届いたデータ"), el("b", {}, `${card.items}件`)),
      el("div", {}, el("span", { class: "muted" }, "作った人"), el("b", {}, `${card.creators}人`)),
      el("div", {}, el("span", { class: "muted" }, "合計の長さ"), el("b", {}, `${Math.round(card.total_duration_sec / 60 * 10) / 10}分`)),
      el("div", {}, el("span", { class: "muted" }, "品質 A / B / C"), el("b", {}, `${card.grades.A} / ${card.grades.B} / ${card.grades.C}`)),
    );
    $("#detail-note").textContent = `${card.license_terms} · 本人の声を使ったなりすましへの利用は禁止です · 問題があれば各データの届いた日から${meta.hold_days}日以内に報告できます。認められると全額を返金します。`;
    $("#detail-json").href = `/api/orders/${o.id}/datacard`;
    $("#detail-items").replaceChildren(...(card.assets.length ? card.assets.map((a) => {
      let report;
      if (a.dispute) report = pill(disputeLabel[a.dispute]);
      else if (a.can_dispute) {
        const reason = el("input", { placeholder: "何が問題か（5文字以上）", maxlength: "1000", "aria-label": "問題の内容" });
        report = el("div", { class: "inline-form" }, reason, el("button", { type: "button", class: "secondary small", onclick: async () => {
          try { await api(`/api/sales/${a.sale_id}/dispute`, { method: "POST", json: { reason: reason.value } }); show(msg, `データ #${a.asset_id} の問題を報告しました。運営が確認します。`); showDetail(o); }
          catch (err) { show(msg, err.message, false); }
        } }, "報告する"));
      } else report = el("span", { class: "muted" }, "期間終了");
      return el("tr", {},
        el("td", {}, `#${a.asset_id}`), el("td", {}, a.grade), el("td", { class: "num" }, `${a.duration_sec}秒`),
        el("td", { class: "muted" }, a.sha256.slice(0, 12) + "…"),
        el("td", {}, a.download ? el("a", { href: a.download }, "ダウンロード") : pill(["返金済み", "bad"])),
        el("td", {}, report));
    }) : [el("tr", {}, el("td", { colspan: 6, class: "muted" }, "まだ届いたデータはありません"))]));
    $("#detail").scrollIntoView({ behavior: "smooth" });
  }

  async function load() {
    const rows = await api("/api/orders/mine");
    $("#orders").replaceChildren(...(rows.length ? rows.map((o) => el("tr", {},
      el("td", {}, o.id),
      el("td", {}, o.kind === "catalog" ? `カタログ · ${o.category_label}` : `${o.category_label} · ${o.tier_label} · ${o.industry_label}`,
        o.promoted ? el("span", {}, " ", pill(["注目", "feat"])) : "",
        el("br"), el("span", { class: "muted" }, `${o.license_label}${o.deadline_at ? " · 締切 " + date(o.deadline_at) : ""}`)),
      el("td", { class: "num" }, `${o.delivered} / ${o.units}`, o.pending ? el("span", { class: "muted" }, ` (審査中 ${o.pending})`) : ""),
      el("td", { class: "num" }, yen(o.invoice_jpy), o.refunded_jpy ? el("span", { class: "muted" }, el("br"), `返金 ${yen(o.refunded_jpy)}`) : ""),
      el("td", {}, pill(statusLabel[o.status] || [o.status])),
      el("td", {}, o.delivered ? el("button", { type: "button", class: "secondary small", onclick: () => showDetail(o) }, "納品を見る")
        : o.status === "awaiting_payment" ? el("button", { type: "button", class: "secondary small", onclick: async () => {
          if (!confirm(`注文 #${o.id} をキャンセルしますか？`)) return;
          try { await api(`/api/orders/${o.id}/cancel`, { method: "POST" }); show(msg, `注文 #${o.id} をキャンセルしました`); load(); }
          catch (err) { show(msg, err.message, false); }
        } }, "キャンセル") : "—"),
    )) : [el("tr", {}, el("td", { colspan: 6, class: "muted" }, "まだ注文はありません"))]));
  }
  load();
}

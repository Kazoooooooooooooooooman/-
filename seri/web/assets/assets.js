import { api, $, show, el, yen, requireUser, pill, date } from "/assets/api.js";

const me = await requireUser(["creator"]);
if (me) {
  const msg = $("#msg");

  function catalogCell(a) {
    if (a.status === "removed") return pill(["販売停止（買い手の報告）", "bad"]);
    if (a.forever_exclusive) return pill(["買い切り・評価用（独占）", ""]);
    if (a.exclusive_until) return pill([`独占中（${date(a.exclusive_until)}まで）`, "wait"]);
    if (!a.listed) return pill(["非公開", ""]);
    return a.in_catalog ? pill(["販売中", "good"]) : pill(["レギュラーから販売", ""]);
  }

  async function load() {
    const [dash, assets, earn] = await Promise.all([api("/api/creator/dashboard"), api("/api/creator/assets"), api("/api/earnings")]);
    $("#totals").replaceChildren(
      el("div", {}, el("span", { class: "muted" }, "これまでの収入"), el("b", {}, yen(dash.all_time.total_jpy))),
      el("div", {}, el("span", { class: "muted" }, "うち印税"), el("b", {}, yen(dash.all_time.royalty_jpy))),
      el("div", {}, el("span", { class: "muted" }, "データ資産"), el("b", {}, `${assets.length}件`)),
      el("div", {}, el("span", { class: "muted" }, "買った会社"), el("b", {}, `${dash.stats.buyers}社`)),
    );
    $("#royalty-note").textContent = dash.royalties_on
      ? "標準ライセンスのデータはカタログに並び、別の会社に売れるたびに印税が入ります。出したくないデータは非公開にできます。"
      : `レギュラーになると、あなたのデータがカタログに並び、売れるたびに印税が入ります（${dash.next ? dash.next.needs.join("、") : ""}）。`;
    $("#assets").replaceChildren(...(assets.length ? assets.map((a) => {
      const canToggle = a.status === "active" && !a.forever_exclusive;
      return el("tr", {},
        el("td", {}, a.id), el("td", {}, `${a.category_label} · ${a.duration_sec}秒`), el("td", {}, a.grade),
        el("td", { class: "num" }, `${a.sold}回`), el("td", { class: "num" }, yen(a.earned_jpy)), el("td", {}, catalogCell(a)),
        el("td", {}, canToggle ? el("button", { type: "button", class: "secondary small", onclick: async () => {
          try { await api(`/api/creator/assets/${a.id}`, { method: "POST", json: { listed: !a.listed } }); show(msg, a.listed ? `#${a.id} を非公開にしました` : `#${a.id} を公開しました`); load(); }
          catch (err) { show(msg, err.message, false); }
        } }, a.listed ? "非公開にする" : "公開する") : ""));
    }) : [el("tr", {}, el("td", { colspan: 7, class: "muted" }, "合格したデータがここに資産として並びます"))]));
    $("#sales").replaceChildren(...(earn.sales.length ? earn.sales.map((s) => el("tr", {},
      el("td", {}, date(s.at)), el("td", {}, s.buyer), el("td", {}, pill([s.kind_label, s.kind === "royalty" ? "gold" : ""])),
      el("td", {}, `#${s.asset_id} ${s.category}`), el("td", {}, s.license),
      el("td", { class: "num" }, yen(s.price_jpy)),
      el("td", { class: "num" }, s.refunded ? el("span", {}, el("s", {}, yen(s.you_jpy)), " 返金") : yen(s.you_jpy)),
    )) : [el("tr", {}, el("td", { colspan: 7, class: "muted" }, "まだ売れたデータはありません"))]));
  }
  load();
}

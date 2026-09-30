import { api, $, show, el, yen, requireUser, pill } from "/assets/api.js";

const me = await requireUser(["buyer"]);
if (me) {
  const meta = await api("/api/meta");
  const msg = $("#msg");
  for (const [k, v] of Object.entries(meta.categories)) $("#category").append(el("option", { value: k }, v.label));
  for (const [k, v] of Object.entries(meta.grades)) $("#grade").append(el("option", { value: k }, v.label));
  for (const [k, v] of Object.entries(meta.industries)) $("#industry").append(el("option", { value: k }, k ? v.label : "指定なし"));

  let items = [];
  const picked = new Map(); // asset id -> price

  function renderTotal() {
    const total = [...picked.values()].reduce((a, b) => a + b, 0);
    $("#total").textContent = yen(total);
    $("#selected").textContent = `${picked.size}件`;
    $("#buy").disabled = picked.size === 0;
  }

  function render() {
    $("#count").textContent = `${items.length}件`;
    $("#items").replaceChildren(...(items.length ? items.map((i) => {
      const box = el("input", { type: "checkbox", class: "checkbox", "aria-label": `データ #${i.id} を選ぶ` });
      box.checked = picked.has(i.id);
      box.addEventListener("change", () => { box.checked ? picked.set(i.id, i.price_jpy) : picked.delete(i.id); renderTotal(); });
      return el("tr", {}, el("td", {}, box), el("td", {}, `#${i.id}`), el("td", {}, pill([i.grade, i.grade === "A" ? "good" : ""])),
        el("td", { class: "num" }, `${i.duration_sec}秒`), el("td", {}, i.industry_label || "—"), el("td", { class: "num" }, yen(i.price_jpy)));
    }) : [el("tr", {}, el("td", { colspan: 6, class: "muted" }, "条件に合うデータは今ありません。新しく作ってほしい場合は「注文」から依頼できます。"))]));
    renderTotal();
  }

  async function load() {
    const f = new FormData($("#filters"));
    const q = new URLSearchParams({ category: f.get("category"), grade: f.get("grade"), industry: f.get("industry"), limit: "200" });
    try { items = await api("/api/catalog?" + q); picked.clear(); render(); }
    catch (err) { show(msg, err.message, false); }
  }
  $("#filters").addEventListener("change", load);
  $("#select-all").onclick = () => { for (const i of items) picked.set(i.id, i.price_jpy); render(); };
  $("#clear").onclick = () => { picked.clear(); render(); };
  $("#buy").onclick = async () => {
    try {
      const o = await api("/api/catalog/orders", { method: "POST", json: { asset_ids: [...picked.keys()] } });
      show(msg, `注文 #${o.id}（${o.units}件・${yen(o.invoice_jpy)}）を受け付けました。入金を確認したら「注文」からダウンロードできます。`);
      load();
    } catch (err) { show(msg, err.message, false); }
  };
  load();
}

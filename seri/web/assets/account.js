import { api, $, show, el, requireUser, pill, downloadJson } from "/assets/api.js";

let me = await requireUser();
if (me) {
  const msg = $("#msg");
  const roleLabel = { creator: "クリエイター", buyer: "企業", reviewer: "レビュアー", admin: "運営" };

  function render() {
    $("#name").textContent = me.name;
    const rows = [["メールアドレス", me.email], ["使い方", roleLabel[me.role]]];
    if (me.role === "buyer") rows.push(["会社名", me.org || "—"]);
    if (me.role === "creator") rows.push(["職種", me.industry ? `${me.industry_label}（${me.industry_verified ? "確認済み" : "確認待ち"}）` : "—"]);
    $("#profile").replaceChildren(...rows.map(([k, v]) => el("tr", {}, el("th", {}, k), el("td", {}, v))));
    if (me.deletion_requested) {
      $("#delete").disabled = true;
      $("#delete").textContent = "削除を依頼済みです";
    }
  }
  render();

  if (me.role === "creator") {
    $("#work").hidden = false;
    $("#accept-buyout").checked = me.accept_buyout;
    $("#accept-buyout").addEventListener("change", async (e) => {
      try { me = await api("/api/account/settings", { method: "POST", json: { accept_buyout: e.target.checked } }); show(msg, "設定を保存しました"); }
      catch (err) { show(msg, err.message, false); }
    });
    const c = await api("/api/account/consents");
    $("#consents-card").hidden = false;
    $("#consents").replaceChildren(...c.accepted.map((a) => el("div", { class: "card" },
      el("div", { class: "row" }, pill([`版 ${a.version}`, a.version === c.current.version ? "good" : ""]),
        el("span", { class: "muted" }, new Date(a.accepted_at).toLocaleString("ja-JP") + " に同意")),
      el("p", {}, a.text || "（この版の本文は運営が保管しています）"),
      el("p", { class: "muted" }, `本文の指紋（SHA-256）: ${a.text_sha256.slice(0, 16)}…`))));
  }

  $("#password").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await api("/api/account/password", { method: "POST", json: { current: f.get("current"), new: f.get("new") } }); e.target.reset(); show(msg, "パスワードを変更しました"); }
    catch (err) { show(msg, err.message, false); }
  });

  $("#export").onclick = async () => {
    try { downloadJson(await api("/api/account/export"), `seri-my-data-${new Date().toISOString().slice(0, 10)}.json`); }
    catch (err) { show(msg, err.message, false); }
  };

  $("#delete").onclick = async () => {
    if (!confirm("アカウントの削除を依頼しますか？ すぐに仕事の受付とデータの販売が止まります。")) return;
    try { me = await api("/api/account/delete-request", { method: "POST" }); render(); show(msg, "削除の依頼を受け付けました。運営からご連絡します。"); }
    catch (err) { show(msg, err.message, false); }
  };
}

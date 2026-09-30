import { api, show } from "/assets/api.js";

for (const [id, role] of [["wl-creator", "creator"], ["wl-buyer", "buyer"]]) {
  const form = document.getElementById(id), msg = document.getElementById(id + "-msg");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    try {
      await api("/api/waitlist", { method: "POST", json: { email: f.get("email"), role, note: f.get("note") || "" } });
      form.reset();
      show(msg, role === "creator" ? "申し込みを受け付けました。準備ができ次第ご連絡します。" : "お問い合わせを受け付けました。担当者からご連絡します。");
    } catch (err) { show(msg, err.message, false); }
  });
}

// Public numbers. The success rate only appears once enough people are active for it to mean something.
try {
  const s = await api("/api/public/stats");
  if (s.creators >= 10) {
    const box = document.getElementById("public-stats");
    const tile = (label, value) => { const d = document.createElement("div"); const a = document.createElement("span"); a.className = "muted"; a.textContent = label; const b = document.createElement("b"); b.textContent = value; d.append(a, b); return d; };
    box.append(tile("クリエイター", `${s.creators.toLocaleString("ja-JP")}人`), tile("作った人に支払った額", "¥" + s.paid_to_creators_jpy.toLocaleString("ja-JP")));
    if (s.success) box.append(tile(`${s.success.month} 月3万円以上`, `${Math.round(s.success.rate * 100)}%（${s.success.active}人中）`));
    box.hidden = false;
  }
} catch { /* the page works without the numbers */ }

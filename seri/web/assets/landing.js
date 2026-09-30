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

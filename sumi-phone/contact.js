/* お問い合わせ：内容を Apps Script に送り、スプレッドシートの「問い合わせ」に残して、運営者にメールで知らせる。
   メールのアプリを開く方式（mailto）は、パソコンにメールのアプリがないと何も起きないので使わない */
(() => {
  const EN = document.documentElement.lang === "en";
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbwa7cTRb-GxlCZKVGaWIP2FuVBQFpsDR7FpMjVoYrGJ9G6EyfLiTS_iIfux6H1iVB0Y/exec";
  const form = document.getElementById("contact-form");
  if (!form) return;
  const msg = document.getElementById("contact-msg");
  const btn = form.querySelector("button[type=submit]");
  const $ = (id) => document.getElementById(id);
  const fallback = EN
    ? "It didn’t go through. Please email us directly at hello@sotophone.jp."
    : "送れませんでした。お手数ですが、hello@sotophone.jp に直接お送りください。";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("c-email");
    email.value = email.value.normalize("NFKC").replace(/[。．]/g, ".").replace(/\s+/g, "");
    const message = $("c-message").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
      msg.textContent = EN ? "Please check your email address." : "メールアドレスの形を確認してください（例：you@example.com）。";
      email.focus();
      return;
    }
    if (!message) {
      msg.textContent = EN ? "Please write your message." : "内容を書いてください。";
      $("c-message").focus();
      return;
    }
    const data = {
      type: "contact",
      topic: $("c-topic").value,
      name: $("c-name").value.trim(),
      email: email.value,
      message,
      website: $("c-website").value, // ここに何か入っていたら機械による送信
      lang: EN ? "en" : "ja",
    };
    btn.disabled = true;
    msg.textContent = EN ? "Sending…" : "送信しています…";
    try {
      const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(data) });
      const out = await res.json().catch(() => null);
      if (!out || !out.ok) throw new Error(out && out.error || "server");
      const done = document.createElement("div");
      done.className = "contact-done";
      done.setAttribute("role", "status");
      const a = document.createElement("p");
      a.textContent = EN ? "Thank you. We’ve received your message." : "送信しました。ありがとうございます。";
      const b = document.createElement("p");
      b.textContent = EN ? `We’ll reply to ${data.email} within 3 business days.` : `3営業日以内に、${data.email} にお返事します。`;
      done.append(a, b);
      form.replaceWith(done);
    } catch (err) {
      console.error("Contact not sent:", err);
      msg.textContent = fallback;
      btn.disabled = false;
    }
  });
})();

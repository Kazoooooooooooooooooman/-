/* 新しいデザインの比較用ページ（/new/）の、登録と計測。
   送る中身は今のトップ（/script.js）と同じ形にして、同じ Apps Script・同じシートで比べられるようにする。
   パターンは n（トップで新しいデザインに振り分けられた人）、URL で直接開いた人は n-url。英語版は n-en / n-en-url */
(() => {
  const FORM_ENDPOINT = "https://script.google.com/macros/s/AKfycbwa7cTRb-GxlCZKVGaWIP2FuVBQFpsDR7FpMjVoYrGJ9G6EyfLiTS_iIfux6H1iVB0Y/exec";
  const POLICY_VERSION = "2026-10-24";
  const SENT_KEY = "soto-preorder", CODE_KEY = "soto-code", FROM_KEY = "soto-from", MAIL_KEY = "soto-mail", NUM_KEY = "soto-number";
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* 覚えられなくても登録はできる */ } },
  };
  const OPENED_AT = Date.now();
  const EN = document.documentElement.lang === "en";
  // 英語版（/new/en）は n-en。URL で直接開いた人は n-url / n-en-url
  const variant = (EN ? "n-en" : "n") + (store.get("soto-h") === "n" && !/[?&]h=n\b/.test(location.search) ? "" : "-url");
  const T = EN ? {
    ok: (n) => (n ? "You're " + n : "You're in"),
    sent: (m) => "We've emailed " + (m ? m : "you") + " your sign-up number. If it doesn't arrive, please check your spam folder.",
    bad: "Please check your email address (e.g. you@example.com).",
    sending: "Signing you up…",
    fail: "Something went wrong. Please try again in a moment.",
    offline: "Couldn't sign you up. Please check your connection and try again.",
  } : {
    ok: (n) => (n ? n + " で受け付けました" : "受け付けました"),
    sent: (m) => (m ? m + " に、" : "") + "登録番号をメールでお送りしました。届かないときは、迷惑メールのフォルダもご確認ください。",
    bad: "メールアドレスの形を確認してください（例：you@example.com）。",
    sending: "登録しています…",
    fail: "登録できませんでした。時間をおいて、もう一度お試しください。",
    offline: "登録できませんでした。通信状態を確かめて、もう一度お試しください。",
  };

  // どこから来たか（トップと同じ記録を使う。トップから振り分けられて来た人は、トップで記録した経路のまま）
  const params = new URLSearchParams(location.search);
  const clean = (v, n) => String(v || "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, n);
  const arrival = (() => {
    const r = clean(params.get("r"), 12);
    const from = clean(params.get("from") || params.get("utm_source"), 40) || (r ? "friend" : "");
    let site = "";
    try {
      const host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : "";
      if (host && host !== location.hostname) site = host.slice(0, 60);
    } catch (_) { /* 読めない参照元は空のままでよい */ }
    let first = null;
    try { first = JSON.parse(store.get(FROM_KEY) || "null"); } catch (_) { /* 壊れていたら上書きする */ }
    if (!first || (!first.from && !first.site && !first.r && (from || site || r))) {
      first = { from, site, r };
      store.set(FROM_KEY, JSON.stringify(first));
    } else if (r && !first.r) {
      first.r = r;
      store.set(FROM_KEY, JSON.stringify(first));
    }
    return first;
  })();

  function deviceInfo() {
    const ua = navigator.userAgent || "";
    const touch = (navigator.maxTouchPoints || 0) > 1;
    const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch);
    let type = "パソコン";
    if (ipad || (/Android/.test(ua) && !/Mobile/.test(ua)) || /Tablet|Silk|Kindle|PlayBook/.test(ua)) type = "タブレット";
    else if (/iPhone|iPod|Android.*Mobile|Mobile.*Firefox|Windows Phone|Mobi/.test(ua)) type = "スマホ";
    let os = "その他", m;
    if ((m = ua.match(/(?:iPhone|iPad|iPod)[^)]*OS (\d+)[_.](\d+)/))) os = (ipad ? "iPadOS " : "iOS ") + m[1] + "." + m[2];
    else if (ipad) os = "iPadOS";
    else if ((m = ua.match(/Android (\d+(?:\.\d+)?)/))) os = "Android " + m[1];
    else if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
    else if ((m = ua.match(/Mac OS X (\d+)[_.](\d+)/))) os = "macOS " + m[1] + "." + m[2];
    else if (/CrOS/.test(ua)) os = "ChromeOS";
    else if (/Linux/.test(ua)) os = "Linux";
    const app = /Instagram/.test(ua) ? "Instagram" : /FBAN|FBAV|FB_IAB/.test(ua) ? "Facebook" : /\bLine\//.test(ua) ? "LINE"
      : /musical_ly|BytedanceWebview|TikTok/i.test(ua) ? "TikTok" : /Twitter|TwitterAndroid/.test(ua) ? "X" : /GSA\//.test(ua) ? "Googleアプリ" : "";
    let br = "その他";
    if ((m = ua.match(/EdgA?\/(\d+)/))) br = "Edge " + m[1];
    else if ((m = ua.match(/SamsungBrowser\/(\d+)/))) br = "Samsung " + m[1];
    else if ((m = ua.match(/(?:CriOS|Chrome)\/(\d+)/))) br = "Chrome " + m[1];
    else if ((m = ua.match(/(?:FxiOS|Firefox)\/(\d+)/))) br = "Firefox " + m[1];
    else if ((m = ua.match(/Version\/(\d+(?:\.\d+)?).*Safari/))) br = "Safari " + m[1];
    else if (/AppleWebKit/.test(ua) && /Mobile/.test(ua)) br = "WebView";
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (_) { /* 取れなくてもよい */ }
    const utm = ["utm_source", "utm_medium", "utm_campaign", "utm_content"].map((k) => clean(params.get(k), 40)).filter(Boolean).join("/");
    return {
      type, os, browser: br, app,
      screen: (screen.width || 0) + "x" + (screen.height || 0) + "@" + Math.round((window.devicePixelRatio || 1) * 100) / 100,
      viewport: (innerWidth || 0) + "x" + (innerHeight || 0),
      lang: String(navigator.language || "").slice(0, 12), tz: tz.slice(0, 40),
      dark: matchMedia("(prefers-color-scheme: dark)").matches ? "ダーク" : "ライト",
      hour: new Date().getHours(), utm,
    };
  }
  const post = (body) => fetch(FORM_ENDPOINT, { method: "POST", mode: "no-cors", keepalive: true, headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) }).catch(() => { /* 数えられなくても表示には関係ない */ });

  // 見た人の数（同じブラウザでは1日1回だけ）
  (() => {
    const day = new Date().toISOString().slice(0, 10), key = "soto-hv-" + variant;
    if (store.get(key) === day) return;
    store.set(key, day);
    try { post({ type: "view", variant, from: arrival.from || "", site: arrival.site || "", device: deviceInfo() }); } catch (_) { /* 表示には関係ない */ }
  })();

  // 1回の訪問で、どれだけ見てもらえたか
  (() => {
    if (!navigator.sendBeacon) return;
    const visit = Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => n.toString(16).padStart(2, "0")).join("");
    const order = ["story", "time", "road", "faq", "close"];
    const names = { story: "物語", time: "時間", road: "道のり", faq: "よくある質問", close: "最後" };
    let shown = 0, since = document.visibilityState === "visible" ? Date.now() : 0, maxPct = 0, deepest = "story", touched = false, pressed = false, done = false, sent = 0;
    addEventListener("scroll", () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      maxPct = Math.max(maxPct, h > 0 ? Math.round((scrollY / h) * 100) : 100);
      for (let i = order.length - 1; i >= 0; i--) {
        const el = order[i] === "close" ? document.querySelector(".close") : document.getElementById(order[i]);
        if (el && el.getBoundingClientRect().top < innerHeight * 0.6) { if (order.indexOf(deepest) < i) deepest = order[i]; break; }
      }
    }, { passive: true });
    document.addEventListener("focusin", (e) => { if (e.target && e.target.type === "email") touched = true; });
    document.addEventListener("submit", () => { pressed = true; }, true);
    document.addEventListener("soto:registered", () => { done = true; });
    const send = () => {
      if (since) { shown += Date.now() - since; since = 0; }
      const seconds = Math.round(shown / 1000);
      if (seconds === sent) return;
      sent = seconds;
      const body = JSON.stringify({ type: "stay", variant, visit, seconds, scroll: maxPct, deepest: names[deepest] || deepest, touched, pressed, registered: done, from: arrival.from || "", device: deviceInfo() });
      try { navigator.sendBeacon(FORM_ENDPOINT, new Blob([body], { type: "text/plain;charset=utf-8" })); } catch (_) { /* 表示には関係ない */ }
    };
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") send(); else since = Date.now(); });
    addEventListener("pagehide", send);
  })();

  function myCode() {
    let c = store.get(CODE_KEY);
    if (!c) {
      const abc = "abcdefghjkmnpqrstuvwxyz23456789", rnd = crypto.getRandomValues(new Uint8Array(6));
      c = Array.from(rnd, (n) => abc[n % abc.length]).join("");
      store.set(CODE_KEY, c);
    }
    return c;
  }
  const label = (n) => "No." + String(n).padStart(3, "0");
  const mask = (e) => { const [u, d] = String(e).split("@"); return d ? u.slice(0, 2) + "•••@" + d : ""; };

  const forms = [["hero-form", "hero-msg", "hero"], ["join-form", "join-msg", "bottom"]]
    .map(([f, m, source]) => ({ form: document.getElementById(f), msg: document.getElementById(m), source })).filter((x) => x.form);

  function showDone() {
    const num = store.get(NUM_KEY), mail = store.get(MAIL_KEY) || "";
    forms.forEach(({ form, msg }) => {
      form.hidden = true;
      msg.textContent = "";
      const box = document.createElement("div");
      box.className = "done";
      box.innerHTML = "<b></b><p></p>";
      box.querySelector("b").textContent = T.ok(num ? label(num) : "");
      box.querySelector("p").textContent = T.sent(mail ? mask(mail) : "");
      msg.replaceWith(box);
    });
  }
  if (/[?&]reset\b/.test(location.search)) { try { localStorage.removeItem(SENT_KEY); } catch (_) { /* 消せなくてもよい */ } }
  if (store.get(SENT_KEY)) showDone();

  forms.forEach(({ form, msg, source }) => form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.querySelector("input[type=email]"), btn = form.querySelector("button[type=submit]");
    email.value = email.value.normalize("NFKC").replace(/[。．]/g, ".").replace(/\s+/g, "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
      msg.textContent = T.bad;
      email.focus();
      return;
    }
    const data = {
      email: email.value.trim(), prefecture: "", lang: EN ? "en" : "ja", trial: false, source, variant,
      device: Object.assign(deviceInfo(), { seconds: Math.round((Date.now() - OPENED_AT) / 1000) }),
      from: arrival.from || "", site: arrival.site || "",
      invitedBy: arrival.r && arrival.r !== store.get(CODE_KEY) ? arrival.r : "",
      code: myCode(), consent: "notice", policy: POLICY_VERSION, createdAt: new Date().toISOString(),
    };
    btn.disabled = true;
    msg.textContent = T.sending;
    try {
      const res = await fetch(FORM_ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(data) });
      const text = await res.text();
      let out = null;
      try { out = JSON.parse(text); } catch (_) { /* Apps Script のエラー画面 */ }
      if (!out || !out.ok) {
        msg.textContent = out && out.error === "bad_email" ? T.bad : T.fail;
        btn.disabled = false;
        return;
      }
      if (out.code) store.set(CODE_KEY, out.code);
      if (out.number) store.set(NUM_KEY, String(out.number));
      store.set(SENT_KEY, "1");
      store.set(MAIL_KEY, data.email);
      document.dispatchEvent(new Event("soto:registered"));
      showDone();
    } catch (_) {
      msg.textContent = T.offline;
      btn.disabled = false;
    }
  }));
})();

/* 「優先案内を受け取る」への行き方：物語の最後（登録の章）までスクロールする。
   スマホでは、物語を読み終えたあと、ほかの登録ボタンが見えていないときだけ下に登録ボタンを出す */
(() => {
  const story = document.getElementById("story");
  if (!story) return;
  const toJoin = (e) => {
    e.preventDefault();
    const y = story.offsetTop + story.offsetHeight - innerHeight + 2;
    scrollTo({ top: y, behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "auto" : "smooth" });
    setTimeout(() => { const i = document.querySelector("#join input[type=email]"); if (i) i.focus({ preventScroll: true }); }, 900);
  };
  document.querySelectorAll('a[href="#join"]').forEach((a) => a.addEventListener("click", toJoin));
  const bar = document.getElementById("sticky-cta");
  if (!bar) return;
  let registered = false, others = 0;
  document.addEventListener("soto:registered", () => { registered = true; tick(); });
  try { registered = !!localStorage.getItem("soto-preorder"); } catch (_) { /* 読めなくてもよい */ }
  // ほかの登録ボタン・登録欄が画面に見えているあいだは出さない（同じボタンを2つ並べない）
  const seen = new Set();
  const io = new IntersectionObserver((es) => { es.forEach((e) => (e.isIntersecting ? seen.add(e.target) : seen.delete(e.target))); others = seen.size; tick(); });
  document.querySelectorAll(".btn-cta, form").forEach((el) => { if (!el.closest("#sticky-cta")) io.observe(el); });
  // 物語の章は文章が画面の下にあるので、物語を読み終えてから出す
  const tick = () => {
    const r = story.getBoundingClientRect();
    const show = r.bottom < innerHeight * 0.4 && !others && !registered;
    bar.classList.toggle("show", show);
    document.documentElement.classList.toggle("sticky-on", show); /* 同じボタンを2つ並べない */
    bar.setAttribute("aria-hidden", show ? "false" : "true");
    bar.tabIndex = show ? 0 : -1;
  };
  addEventListener("scroll", tick, { passive: true });
  addEventListener("resize", tick);
  tick();
})();

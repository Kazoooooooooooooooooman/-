(() => {
  const EN = document.documentElement.lang === "en";
  const nav = document.querySelector(".nav");

  // スクロールしたら、ナビに紙色の帯を敷く
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 40);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // 文字と絵のフェードイン
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("is-in")),
    // 画面の下の方に少し入ってから始めて、一枚ずつに目が向くようにする
    { threshold: 0.2, rootMargin: "0px 0px -12% 0px" }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  // 背景：画面の真ん中にあるセクションの絵を表示する。上半分は紙、Soto Phone からは水彩
  const layers = document.querySelectorAll(".bg-layer");
  const panels = document.querySelectorAll("main [data-bg]");
  let current = -1;
  function onScrollBg() {
    const mid = window.innerHeight / 2;
    let active = panels[0];
    panels.forEach((p) => { const r = p.getBoundingClientRect(); if (r.height && r.top <= mid) active = p; }); // 隠れているセクション（パターン n 専用など）は数えない
    const i = Number(active.dataset.bg);
    if (i !== current) {
      current = i;
      // 背景の絵は、いまの絵と次の絵だけ読み込む（最初の画面で6枚全部を読まないように）
      layers.forEach((l) => {
        const n = Number(l.dataset.i), img = l.querySelector("img[data-src]");
        if (img && (n === i || n === i + 1)) { img.src = img.dataset.src; img.removeAttribute("data-src"); }
      });
      layers.forEach((l) => l.classList.toggle("is-active", Number(l.dataset.i) === i));
    }
    // 絵は文字よりゆっくり動く（奥行き）
    const r = active.getBoundingClientRect();
    const t = Math.max(-1, Math.min(1, (mid - (r.top + r.height / 2)) / window.innerHeight));
    document.querySelector(".bg").style.setProperty("--py", (-t * 24).toFixed(1) + "px");
  }
  if (layers.length && panels.length) {
    window.addEventListener("scroll", onScrollBg, { passive: true });
    window.addEventListener("resize", onScrollBg);
    onScrollBg();
  }

  // 色のシーン：白黒の紙に、淡い黄色のにじみが一つ。最初から落ち着いた姿で置く
  const ink = document.getElementById("ink");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (ink && !reduce) {
    const stage = ink.querySelector(".ink-stage");
    const svg = ink.querySelector(".ink-svg");
    const lobes = ink.querySelectorAll(".ink-core circle");
    // にじみの形：中心の円にずらした円を重ねて、いびつな墨溜まりにする [dx, dy, 半径]（R 比）
    const LOBES = [[0, 0, 1], [0.42, -0.18, 0.62], [-0.38, 0.26, 0.58], [0.12, 0.46, 0.5], [-0.3, -0.4, 0.44]];
    const halo = ink.querySelector(".ink-halo");
    const drop = ink.querySelector(".ink-drop");
    const splash = ink.querySelector(".ink-splash");
    const text = ink.querySelector(".ink-text");
    const target = document.getElementById("ink-target");
    const line = ink.querySelector(".ink-after");
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const seg = (p, a, b) => clamp((p - a) / (b - a));
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    // 飛び散る小さな墨の粒（毎回同じ形になるよう固定値）
    const dots = [[-1.6, .9, 5], [1.3, 1.2, 4], [-.7, -1.5, 3], [1.8, -.6, 6], [.2, 1.9, 3], [-1.9, -.4, 4], [.9, -1.7, 2.5]];
    splash.innerHTML = dots.map(() => '<circle r="0"></circle>').join("");
    const dotEls = splash.querySelectorAll("circle");
    let W = 0, Hh = 0, cx = 0, cy = 0;
    function measure() {
      const sr = stage.getBoundingClientRect();
      W = sr.width; Hh = sr.height;
      svg.setAttribute("viewBox", `0 0 ${W} ${Hh}`);
      const tr = target.getBoundingClientRect();
      cx = tr.left - sr.left + tr.width / 2;
      cy = tr.top - sr.top + tr.height / 2;
    }
    function render(p) {
      const R = Math.min(W, Hh) * 0.3;
      // 1. 一滴が落ちる
      const fall = ease(seg(p, 0.10, 0.26));
      drop.style.opacity = p > 0.08 && p < 0.27 ? 1 : 0;
      drop.setAttribute("transform", `translate(${cx} ${-40 + (cy + 40) * fall}) scale(1 ${1 + fall * 0.35})`);
      // 2. 落ちた所からにじんで広がる
      const spread = ease(seg(p, 0.26, 0.48));
      // 3. 広がった色は淡く落ち着いて、紙に残る
      const settle = ease(seg(p, 0.55, 0.75));
      const k = spread * (1 + settle * 0.12);
      lobes.forEach((c, i) => {
        const [dx, dy, rr] = LOBES[i];
        // 外側の膨らみは少し遅れて広がる
        const ki = i === 0 ? k : ease(seg(p, 0.30 + i * 0.02, 0.50)) * (1 + settle * 0.12);
        c.setAttribute("cx", (cx + dx * R * ki).toFixed(1));
        c.setAttribute("cy", (cy + dy * R * ki).toFixed(1));
        c.setAttribute("r", (R * rr * ki).toFixed(1));
      });
      halo.setAttribute("cx", cx); halo.setAttribute("cy", cy);
      halo.setAttribute("r", (R * 1.3 * k).toFixed(1));
      halo.style.opacity = (0.28 - settle * 0.12).toFixed(3);
      ink.querySelector(".ink-core").style.opacity = (1 - settle * 0.62).toFixed(3);
      const splat = seg(p, 0.26, 0.34) * (1 - settle * 0.5);
      dotEls.forEach((d, i) => {
        const [dx, dy, size] = dots[i];
        d.setAttribute("cx", cx + dx * R * 0.55 * (0.6 + spread * 0.5));
        d.setAttribute("cy", cy + dy * R * 0.4 * (0.6 + spread * 0.5));
        d.setAttribute("r", (size * splat * (1 + spread)).toFixed(1));
      });
      // 文字は沈めない（ずっと読める）。色が落ち着いたところで、最後の一文が静かに現れる
      const say = ease(seg(p, 0.66, 0.86));
      line.style.opacity = say.toFixed(3);
      line.style.transform = `translateY(${((1 - say) * 8).toFixed(1)}px)`;
    }
    // 動かさず、にじみが落ち着いた姿で最初から置いておく
    const shown = 1;
    window.addEventListener("resize", () => { measure(); render(shown); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); render(shown); });
    measure(); render(shown);
  }

  // 夜の部屋：真っ暗な中で、スマホの光だけが顔を照らす。画面が切り替わるたびに、光がちらちら変わる
  const room = document.getElementById("room");
  if (room) {
    const dark = room.querySelector(".room-dark");
    const sky = room.querySelector(".rw-sky"), sun = room.querySelector(".rw-sun"), night = room.querySelector(".rw-night");
    const FACE = "26.5% 68%"; // ベッドの顔とスマホのあいだ
    const A = 0.85; // 部屋の暗さ
    sky.style.fill = "rgb(38,37,35)";
    sun.style.opacity = "0";
    night.style.opacity = "1";
    function render(t) {
      // 光の強さ：ゆっくりした揺らぎに、スワイプで画面が変わったような、ときどきの明滅を重ねる
      const slow = 0.06 * Math.sin(t * 1.3) + 0.04 * Math.sin(t * 3.1 + 1);
      const swipe = Math.max(0, Math.sin(t * 2.2)) ** 18 * 0.18 - Math.max(0, Math.sin(t * 2.2 + 0.4)) ** 24 * 0.12;
      const glow = Math.min(1, Math.max(0.55, 0.86 + slow + swipe));
      const r = (22 + 2.5 * Math.sin(t * 0.9)).toFixed(1);
      const inner = (A * (1 - glow * 0.97)).toFixed(3), mid = (A * (1 - glow * 0.55)).toFixed(3);
      dark.style.background = `radial-gradient(circle at ${FACE}, rgba(14,13,12,${inner}) 0, rgba(14,13,12,${mid}) 9%, rgba(14,13,12,${A}) ${r}%)`;
    }
    render(0);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      let visible = false, raf3 = 0;
      const loop = (now) => { render(now / 1000); raf3 = visible ? requestAnimationFrame(loop) : 0; };
      new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible && !raf3) raf3 = requestAnimationFrame(loop);
      }).observe(room);
    }
  }

  // 先行予約フォーム
  // 一般公開のサイトでは、登録を Google スプレッドシート（tools/preorder-apps-script.gs）に送る。
  // FORM_ENDPOINT にそのウェブアプリの URL（https://script.google.com/macros/s/…/exec）を入れる。
  // claude.ai で公開したページでは、登録をページのデータベース（preorders/<登録者ID>）に保存する。
  // どちらもない場合（ファイルを直接開いた場合など）は保存先がないため、その旨を表示する。
  const FORM_ENDPOINT = "https://script.google.com/macros/s/AKfycbwa7cTRb-GxlCZKVGaWIP2FuVBQFpsDR7FpMjVoYrGJ9G6EyfLiTS_iIfux6H1iVB0Y/exec";
  // プライバシーポリシーの版（privacy.html の「最終更新」の日付）。登録と一緒に送り、同意の記録に残す
  const POLICY_VERSION = "2026-10-24";
  const SENT_KEY = "soto-preorder";
  const CODE_KEY = "soto-code"; // この人の紹介コード（友だちに送るリンクに付ける。メールアドレスとは結びつけて残さない）
  const FROM_KEY = "soto-from"; // 最初に来たときの経路（?from= と、どのサイトから来たか）
  // 次に開いたときの「登録しました」に出す、登録したアドレス（打ち間違いに、あとからでも気づけるように）
  const MAIL_KEY = "soto-mail";
  // 登録した順の番号（No.007 のように見せる）。次に開いたときのカードにも出す
  const NUM_KEY = "soto-number";
  const DAY_KEY = "soto-day"; // 登録した日（きっぷの「発行」の日付）
  const store_ = {
    get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* 覚えられなくても登録はできる */ } },
  };

  // どこから来たかを、最初に来たときの分だけ覚えておく（Instagram のリンクに ?from=insta、名刺の QR に ?from=card のように付ける）
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
    try { first = JSON.parse(store_.get(FROM_KEY) || "null"); } catch (_) { /* 壊れていたら上書きする */ }
    // チームの声かけのリンク（?from=kazuma など）は、前に別の経路で来ていても、こちらを優先して数える
    const team = /^(kazuma|kanto|step)(\.[0-9]{1,5})?$/.test(from); // kazuma.12 のように、声かけリストの行番号が付くこともある
    if (!first || team || (!first.from && !first.site && !first.r && (from || site || r))) {
      first = { from, site, r: r || (first && first.r) || "" };
      store_.set(FROM_KEY, JSON.stringify(first));
    } else if (r && !first.r) {
      // 前に検索などで一度来ていた人が、あとから紹介のリンクで来たときも、紹介は記録する（経路は最初のまま）
      first.r = r;
      store_.set(FROM_KEY, JSON.stringify(first));
    }
    return first;
  })();
  // 紹介リンク（?r=）で来た人には、知らない宣伝ページと思われないよう、1枚目のフォームの上に一言出す
  (() => {
    if (!clean(params.get("r"), 12) || store_.get("soto-preorder")) return;
    const form = document.getElementById("hero-form");
    if (!form) return;
    const note = document.createElement("p");
    note.className = "ref-note";
    note.textContent = EN
      ? "You’re here through an invitation from a friend. Pre-ordering is free and only takes your email."
      : "ご友人からの招待リンクでお越しいただきました。先行予約は無料で、メールアドレスだけでご登録いただけます。";
    form.parentNode.insertBefore(note, form);
  })();
  // きっぷの言葉は、押したボタンの約束に合わせる（「先行予約」と書いてあるのは、最初の版 o だけ）
  function ticketWords() {
    const h = (heroVariant() || "a").split("-")[0];
    if (EN) return { title: "Invitation", sub: "See the finished phone first.", stub: "Soto Phone" };
    if (h === "o") return { title: "先行予約券", sub: "発売のお知らせを、いちばん先に。", stub: "先行予約" };
    if (h === "c") return { title: "招待券", sub: "料金を、いちばん先に。", stub: "Soto Phone" };
    if (h === "d") return { title: "招待券", sub: "発売のお知らせを、いちばん先に。", stub: "Soto Phone" };
    return { title: "招待券", sub: "完成品を、いちばん先に。", stub: "Soto Phone" };
  }
  // 見ている環境（人を特定しない範囲で、ページの見せ方を直すためだけに使う）。
  // 端末の種類・OS とその版・ブラウザとその版・アプリの中のブラウザか・画面の大きさ・言語・時間帯・ダークモード
  function deviceInfo() {
    const ua = navigator.userAgent || "";
    const touch = (navigator.maxTouchPoints || 0) > 1;
    const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch); // iPadOS は Mac のふりをする
    let type = "パソコン";
    if (ipad || (/Android/.test(ua) && !/Mobile/.test(ua)) || /Tablet|Silk|Kindle|PlayBook/.test(ua)) type = "タブレット";
    else if (/iPhone|iPod|Android.*Mobile|Mobile.*Firefox|Windows Phone|Mobi/.test(ua)) type = "スマホ";
    let os = "その他", m;
    if ((m = ua.match(/(?:iPhone|iPad|iPod)[^)]*OS (\d+)[_.](\d+)/))) os = (ipad ? "iPadOS " : "iOS ") + m[1] + "." + m[2];
    else if (ipad) os = "iPadOS";
    else if ((m = ua.match(/Android (\d+(?:\.\d+)?)/))) os = "Android " + m[1];
    else if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
    else if ((m = ua.match(/Windows NT (\d+\.\d+)/))) os = "Windows NT " + m[1];
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
    const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (_) { /* 取れなくてもよい */ }
    const p = new URLSearchParams(location.search);
    const utm = ["utm_source", "utm_medium", "utm_campaign", "utm_content"].map((k) => clean(p.get(k), 40)).filter(Boolean).join("/");
    return {
      type, os, browser: br, app,
      screen: (screen.width || 0) + "x" + (screen.height || 0) + "@" + dpr,
      viewport: (window.innerWidth || 0) + "x" + (window.innerHeight || 0),
      lang: String(navigator.language || "").slice(0, 12),
      tz: tz.slice(0, 40),
      dark: window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "ダーク" : "ライト",
      hour: new Date().getHours(),
      utm,
    };
  }
  const OPENED_AT = Date.now();

  // 1枚目のパターン（index.html の先頭で決めて、html の data-h に入れてある）
  function heroVariant() {
    const d = document.documentElement, h = d.getAttribute("data-h");
    if (!h || EN) return "";
    const src = d.getAttribute("data-hsrc");
    return h + (src === "url" || src === "ad" ? "-" + src : ""); // 広告（?from=ig_ad など）から来た人は b-ad、URL で選んで見た人は b-url
  }
  // 1枚目のパターンごとに、見た人の数を数える（同じブラウザでは1日1回だけ）
  (() => {
    const v = heroVariant();
    if (!v || !FORM_ENDPOINT || !document.getElementById("hero-form")) return;
    const day = new Date().toISOString().slice(0, 10), key = "soto-hv-" + v;
    if (store_.get(key) === day) return;
    store_.set(key, day);
    try {
      fetch(FORM_ENDPOINT, { method: "POST", mode: "no-cors", keepalive: true, headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ type: "view", variant: v, from: arrival.from || "", site: arrival.site || "", device: deviceInfo() }) });
    } catch (_) { /* 数えられなくても表示には関係ない */ }
  })();

  // 1回の訪問で、どれだけ見てもらえたかを残す（ページを閉じたり、別のアプリに切りかえたりしたときに送る）。
  // 画面に出ていた秒数、いちばん下までのうち何％まで見たか、どの節まで行ったか、登録欄に触れたか、ボタンを押したか、登録できたか
  (() => {
    const v = heroVariant();
    if (!v || !FORM_ENDPOINT || !document.getElementById("hero-form") || !navigator.sendBeacon) return;
    const visit = Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => n.toString(16).padStart(2, "0")).join("");
    const order = ["top", "problem", "phone", "tools", "points", "faq", "signup"];
    const names = { top: "1枚目", problem: "はじまり", phone: "製品", tools: "機能", points: "スタンプ", faq: "よくある質問", signup: "登録欄" };
    let shown = 0, since = document.visibilityState === "visible" ? Date.now() : 0, maxPct = 0, deepest = "top", touched = false, pressed = false, done = false, sent = 0;
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      maxPct = Math.max(maxPct, h > 0 ? Math.round((scrollY / h) * 100) : 100);
      for (let i = order.length - 1; i >= 0; i--) {
        const el = document.getElementById(order[i]);
        if (el && el.getBoundingClientRect().top < innerHeight * 0.6) { if (order.indexOf(deepest) < i) deepest = order[i]; break; }
      }
    };
    addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("focusin", (e) => { if (e.target && e.target.type === "email") touched = true; });
    document.addEventListener("submit", () => { pressed = true; }, true);
    // 「登録した」は、この訪問でボタンを押して登録できたときだけ「はい」。
    // 前に登録したブラウザで開き直したときは "again:回数" を送り、シートには「登録済み・再訪◯回目」と出す（回数は2026年11月から数え始める）
    let again = 0;
    try {
      if (localStorage.getItem("soto-preorder")) {
        again = (Number(localStorage.getItem("soto-revisit")) || 0) + 1;
        localStorage.setItem("soto-revisit", String(again));
      }
    } catch (_) { /* 覚えていなくても記録には関係ない */ }
    // 登録後に「LINE で送る」「友だちに教える」を押したかを記録する。押したあとすぐ LINE に移るので、その場で送る
    const shared = [];
    document.addEventListener("soto:shared", (e) => {
      const k = e.detail;
      if (shared.indexOf(k) < 0) shared.push(k);
      sent = -1;
      send();
    });
    document.addEventListener("soto:registered", () => {
      if (!pressed) return;
      done = true; again = 0;
      try { localStorage.setItem("soto-revisit", "0"); } catch (_) { /* 同上 */ }
    });
    const send = () => {
      if (since) { shown += Date.now() - since; since = 0; }
      const seconds = Math.round(shown / 1000);
      if (seconds === sent) return; // 前に送った分から変わっていなければ送らない
      sent = seconds;
      const body = JSON.stringify({ type: "stay", variant: v, visit, seconds, scroll: maxPct, deepest: names[deepest] || deepest,
        touched, pressed, registered: done || (again ? "again:" + again : false), shared: shared.join(","), from: arrival.from || "", device: deviceInfo() });
      try { navigator.sendBeacon(FORM_ENDPOINT, new Blob([body], { type: "text/plain;charset=utf-8" })); } catch (_) { /* 送れなくても表示には関係ない */ }
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") send();
      else since = Date.now();
    });
    addEventListener("pagehide", send);
  })();

  // 紹介コード：読み間違えにくい文字だけで6けた
  function myCode() {
    let c = store_.get(CODE_KEY);
    if (!c) {
      const abc = "abcdefghjkmnpqrstuvwxyz23456789", rnd = new Uint8Array(6);
      crypto.getRandomValues(rnd);
      c = Array.from(rnd, (n) => abc[n % abc.length]).join("");
      store_.set(CODE_KEY, c);
    }
    return c;
  }
  const PREFS = "北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県 海外".split(" ");
  const pref = document.getElementById("pref");
  if (pref && pref.tagName === "SELECT") PREFS.forEach((p) => pref.add(new Option(p, p)));
  // 登録フォームは2つ：1枚目（メールアドレスだけ）と、最後（地域と先行体験も選べる）。どちらも同じ保存先に送る
  const forms = [
    { form: document.getElementById("hero-form"), msg: document.getElementById("hero-msg") },
    { form: document.getElementById("reserve-form"), msg: document.getElementById("form-msg") },
  ].filter((f) => f.form);

  let store = null; // { db, path } once the page database is available
  const ready = (async () => {
    if (!window.claude) {
      if (!FORM_ENDPOINT) return null;
      try {
        // URL の最後に ?reset を付けて開くと、このブラウザの「登録済み」の記録を消して、もう一度試せる
        if (/[?&]reset\b/.test(location.search)) localStorage.removeItem(SENT_KEY);
        const saved = localStorage.getItem(SENT_KEY);
        if (saved) showDone({ masked: store_.get(MAIL_KEY) || "" });
      } catch (_) { /* 前回の登録を覚えていなくても登録はできる */ }
      return { endpoint: FORM_ENDPOINT };
    }
    const [db, user] = await Promise.all([claude.use("db"), claude.use("user")]);
    if (!db || !user) return null;
    const id = await user.id();
    if (!id) return null;
    // 閲覧のみの共有（view）の人は書き込めない。分かっている場合は先に伝える
    const canWrite = user.can ? await user.can("data.write") : null;
    store = { ref: db.doc("preorders/" + id), viewOnly: canWrite === false };
    try {
      const snap = await store.ref.get();
      if (snap && snap.exists) showDone(snap.data());
    } catch (_) { /* 読めなくても登録はできる */ }
    return store;
  })().catch(() => null);

  // 先行予約が1件できたことを、Google（アナリティクスと広告）に知らせる。
  // 広告は「登録が終わった人だけが開くページ」で数えるので、見えない小さな枠で /thanks を開く（画面は変わらない）。
  // 開き直したときや、すでに登録している人が来たときは送らない（ここは登録ボタンで新しく登録できたときだけ呼ぶ）
  function converted() {
    try { if (window.gtag) window.gtag("event", "sign_up", { method: "preorder" }); } catch (_) { /* 送れなくても登録には関係ない */ }
    try {
      const f = document.createElement("iframe");
      f.src = "/thanks" + (EN ? "?l=en" : "");
      f.title = "";
      f.setAttribute("aria-hidden", "true");
      f.tabIndex = -1;
      f.style.cssText = "position:absolute;width:1px;height:1px;border:0;left:-9999px;top:0";
      document.body.appendChild(f);
      setTimeout(() => f.remove(), 15000);
    } catch (_) { /* 同上 */ }
  }

  // どちらかで登録できたら、両方のフォームを「登録済み」にする
  function showDone(data) {
    forms.forEach(({ form, msg }) => {
      form.hidden = true;
      msg.textContent = "";
      if (!(form.nextElementSibling && form.nextElementSibling.classList.contains("done"))) form.after(doneCard(data));
    });
    document.dispatchEvent(new Event("soto:registered"));
    // お礼の見出しが、上に固定したメニューの裏に隠れていたら、見える位置まで動かす
    setTimeout(() => {
      const cards = Array.from(document.querySelectorAll(".done")).filter((c) => c.offsetParent);
      const nav = document.querySelector(".nav");
      const navH = nav ? nav.getBoundingClientRect().bottom : 0;
      const c = cards.find((x) => { const r = x.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
      if (!c) return;
      const top = c.getBoundingClientRect().top;
      if (top < navH + 12) scrollTo({ top: scrollY + top - navH - 16, behavior: "auto" });
    }, 350);
    document.querySelectorAll(".hd-fine").forEach((el) => { el.hidden = true; });
  }

  // 登録済みの表示を消して、もう一度入力できる状態に戻す（前の登録はスプレッドシートに残る）
  function reopen() {
    try { localStorage.removeItem(SENT_KEY); localStorage.removeItem(MAIL_KEY); localStorage.removeItem(NUM_KEY); localStorage.removeItem(DAY_KEY); } catch (_) { /* 覚えていなくても入力はできる */ }
    forms.forEach(({ form, msg }) => {
      if (form.nextElementSibling && form.nextElementSibling.classList.contains("done")) form.nextElementSibling.remove();
      form.hidden = false;
      delete form.dataset.checked;
      form.querySelector("button[type=submit]").disabled = false;
      msg.textContent = "";
    });
    document.querySelectorAll(".hd-fine").forEach((el) => { el.hidden = false; });
    const first = forms[0] && forms[0].form.querySelector("input[type=email]");
    if (first) first.focus();
  }

  // 登録が済んだことを、入力欄と同じ形の1枚のカードで伝える。
  // 中身は「済んだこと」「次に起きること」と、友だちに教える2つのボタン、アドレスを直すリンクだけ。
  // 友だちに送るリンクには紹介コードが付き、そこから登録した人の行に「紹介」として残る
  function doneCard(data) {
    const url = "https://sotophone.jp/" + (EN ? "en" : "") + "?r=" + myCode();
    const text = EN
      ? "I've joined the pre-order list for Soto Phone, a phone with no social media and no games.\nIt might suit you if you'd like to spend less time on your phone.\nThe pre-order is free and only takes your email."
      : "SNSもゲームも入っていない携帯電話「Soto Phone」の先行予約に登録しました。\nスマホを触りすぎてしまうのが気になっている方には、合うかもしれません。\n先行予約は無料で、メールアドレスだけで登録できます。";
    const card = document.createElement("div");
    card.className = "done";
    card.setAttribute("role", "status");
    const head = document.createElement("p");
    head.className = "done-head";
    head.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
    // お礼は短くしすぎず、きちんと伝える（言葉のまとまりで折り返す）
    const thanks = document.createElement("span");
    thanks.className = "done-thanks";
    thanks.innerHTML = EN ? "Thank you for signing up." : "<span class='ph'>ご登録いただき、</span><span class='ph'>ありがとうございます。</span>";
    head.append(thanks);
    // 登録した順の番号。ある人にだけ、見出しのすぐ下に「先行予約券」のきっぷとして出す
    const num = Number(store_.get(NUM_KEY)) || 0;
    const badge = document.createElement("div");
    badge.className = "ticket";
    if (num) {
      const day = store_.get(DAY_KEY) || "";
      badge.setAttribute("role", "img");
      const w = ticketWords();
      badge.setAttribute("aria-label", w.title + (EN ? ", number " : "、番号 ") + num);
      badge.innerHTML = '<div class="tk-main"><p class="tk-brand">SOTO PHONE</p><div><p class="tk-title"></p><p class="tk-sub"></p></div><p class="tk-date"></p></div>'
        + '<div class="tk-stub"><p class="tk-k">NO.</p><p class="tk-v"></p><p class="tk-k2"></p></div>';
      badge.querySelector(".tk-title").textContent = w.title;
      badge.querySelector(".tk-sub").textContent = w.sub;
      badge.querySelector(".tk-date").textContent = day ? day + (EN ? " issued" : " 発行") : "";
      badge.querySelector(".tk-v").textContent = String(num).padStart(3, "0");
      badge.querySelector(".tk-k2").textContent = w.stub;
    }
    // 番号の特典。早い番号ほど先に案内、月1回の開発レター、No.300 までは希望で番号刻印、ポップアップへの先行入場
    const perk = document.createElement("p");
    perk.className = "tk-perk";
    perk.textContent = EN
      ? "The earlier your number, the sooner we’ll invite you to buy. Everyone on the list gets a monthly development letter from our founder. Numbers up to No.300 can be engraved on the phone if you’d like. When we open a pop-up store in Tokyo, you’ll get in first."
      : "番号が早いほど、発売のとき先にご案内します。登録した方には、代表からの開発レターを月1回お届けします。No.300 までの方は、ご希望で本体に番号を刻めます。東京でポップアップストアを開くときは、先にお入りいただけます。";
    // 次に起きること。その下の行に、送り先のアドレスと「直す」（打ち間違いに、その場で気づけるように）
    const body = document.createElement("p");
    body.className = "done-body";
    body.textContent = EN ? "We’ll email you the development letter and launch news." : "開発レターと発売のお知らせを、メールでお送りします。";
    const sub = document.createElement("p");
    sub.className = "done-sub";
    const shown = data.email || data.masked;
    if (shown) {
      const addr = document.createElement("span");
      addr.textContent = shown;
      sub.append(addr);
    }
    const fix = msgButton(EN ? (shown ? "Fix" : "Wrong address? Fix it") : (shown ? "直す" : "アドレスを直す"), reopen);
    fix.classList.add("done-fix");
    sub.append(fix);
    const row = document.createElement("div");
    row.className = "done-row";
    // 1つめ：共有の画面が出せる端末ではそれを、出せない端末ではリンクをコピーする
    // 送るボタン：① LINE で送る（目立つボタン）② リンクをコピー ③ ほかのアプリで送る（共有画面が出せる端末だけ）
    const told = (k) => document.dispatchEvent(new CustomEvent("soto:shared", { detail: k }));
    const line = document.createElement("a");
    line.className = "btn btn-cta done-share";
    line.href = "https://line.me/R/share?text=" + encodeURIComponent(text + "\n" + url);
    // スマホでは同じ画面から LINE アプリに移る（新しいタブを開くと、空のタブが残るため）。パソコンでは新しいタブで開く
    if (!matchMedia("(pointer: coarse)").matches) { line.target = "_blank"; line.rel = "noopener"; }
    line.addEventListener("click", () => told("line"));
    line.innerHTML = '<span class="btn-dot" aria-hidden="true"></span><span class="btn-label"></span>';
    line.querySelector(".btn-label").textContent = EN ? "Send on LINE" : "LINE で送る";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "btn done-sub";
    const copyLabel = EN ? "Copy link" : "リンクをコピー";
    copy.innerHTML = '<span class="btn-label"></span>';
    copy.querySelector(".btn-label").textContent = copyLabel;
    copy.addEventListener("click", async () => {
      told("copy");
      try { await navigator.clipboard.writeText(text + "\n" + url); } catch (_) { window.prompt(EN ? "Copy this link" : "このリンクをコピーしてください", url); return; }
      copy.querySelector(".btn-label").textContent = EN ? "Copied" : "コピーしました";
      setTimeout(() => { copy.querySelector(".btn-label").textContent = copyLabel; }, 2200);
    });
    row.append(line, copy);
    if (navigator.share) {
      const share = document.createElement("button");
      share.type = "button";
      share.className = "done-line done-copy";
      share.innerHTML = '<span class="btn-label"></span>';
      share.querySelector(".btn-label").textContent = EN ? "Other apps" : "ほかのアプリで送る";
      share.addEventListener("click", () => { told("sheet"); navigator.share({ title: "Soto Phone", text, url }).catch(() => {}); });
      row.append(share);
    }
    // ご紹介のお願いと御礼。紹介してもらった人が登録するたびに、メールで報告する
    const ask = document.createElement("div");
    ask.className = "done-ask" + (EN ? " is-en" : "");
    // 日本語は、言葉のまとまりごとに折り返す（文の途中の変なところで改行しない）
    const ph = (a) => a.map((t) => "<span class='ph'>" + t + "</span>").join("");
    const tiers = EN
      ? [["1", "Priority prototype invite", "When the prototype is ready"], ["10", "A Soto aluminum bottle", "For the first 100 people to get there"], ["30", "A first-edition Soto T-shirt", "For the first 10 people to get there"]]
      : [["1", "先行体験に優先ご招待", "試作機ができたときにご案内"], ["10", "Soto アルミマイボトル", "先着100名様にお贈りします"], ["30", "Soto 初代 限定Tシャツ", "先着10名様にお贈りします"]];
    const unit = EN ? "" : "名のご紹介で";
    ask.innerHTML = (EN
      ? "<p class='done-ask-h'>A small request</p><p class='done-ask-p'>If someone close to you struggles with how much they use their phone, we’d be grateful if you shared Soto Phone with them using your own link.</p><p class='done-ask-k'>Our thanks, by number of referrals</p>"
      : "<p class='done-ask-h'>ご紹介のお願い</p><p class='done-ask-p'>" + ph(["スマートフォンとの付き合い方に", "悩んでいる方が", "身近にいらっしゃいましたら、", "ご紹介用のリンクから&nbsp;", "Soto Phone を", "お伝えいただけますと幸いです。"]) + "</p><p class='done-ask-k'>ご紹介いただいた人数に応じた御礼</p>")
      + "<ul class='done-tiers'>" + tiers.map(([n, t, sub]) => "<li><span class='dt-n'>" + n + "<small>" + (EN ? (n === "1" ? " referral" : " referrals") : unit) + "</small></span><span class='dt-t'>" + t + "<small>" + sub + "</small></span></li>").join("") + "</ul>"
      + (EN ? "<p class='done-ask-note'>We’ll email you each time someone joins through your link.</p>"
            : "<p class='done-ask-note'>" + ph(["ご紹介の方がご登録されるたびに、", "メールでご報告いたします。"]) + "</p>");
    // お礼は見出しの1行で伝わるので、すぐ下に「ご紹介のお願い」と送るボタンを置く。きっぷと特典、メールの案内はその下
    // 見出しのお礼 → 招待券 → ご紹介のお願いと送るボタン → 特典とメールの案内
    card.append(head);
    if (num) card.append(badge);
    card.append(ask, row);
    if (num) card.append(perk);
    card.append(body, sub);
    return card;
  }

  function msgButton(label, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "msg-link";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  // よく使われるメールのドメイン。1〜2文字違いなら打ち間違いの可能性が高いので、送る前に一度確かめる
  const DOMAINS = ["gmail.com", "googlemail.com", "yahoo.co.jp", "yahoo.com", "ymail.ne.jp", "icloud.com", "me.com", "mac.com",
    "outlook.com", "outlook.jp", "hotmail.com", "hotmail.co.jp", "live.jp", "live.com", "msn.com",
    "docomo.ne.jp", "ezweb.ne.jp", "au.com", "softbank.ne.jp", "i.softbank.jp", "ymobile.ne.jp", "rakuten.jp", "nifty.com", "ybb.ne.jp"];
  // 入れ替え（gmial）も1文字違いと数える編集距離
  function distance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }
  function suggestEmail(value) {
    const at = value.lastIndexOf("@");
    if (at < 1) return "";
    const local = value.slice(0, at), domain = value.slice(at + 1).toLowerCase();
    if (DOMAINS.includes(domain)) return "";
    // gmail.co.jp や icloud.jp のように、前半は合っていて後ろだけ違う場合
    const head = domain.split(".")[0];
    if (head === "gmail" || head === "icloud" || head === "googlemail") return local + "@" + head + ".com";
    let best = "", bestD = 9;
    DOMAINS.forEach((d) => { const n = distance(domain, d); if (n < bestD) { bestD = n; best = d; } });
    const limit = domain.length >= 8 ? 2 : 1;
    return best && bestD <= limit ? local + "@" + best : "";
  }

  forms.forEach(({ form, msg }) => form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.querySelector("input[type=email]");
    const btn = form.querySelector("button[type=submit]");
    // 日本語入力のまま打った全角の英数字や「＠」「。」を、半角に直す
    email.value = email.value.normalize("NFKC").replace(/[。．]/g, ".").replace(/\s+/g, "");
    if (!email.checkValidity() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
      msg.textContent = (EN ? "Please check your email address (for example, you@example.com)." : "メールアドレスの形を確認してください（例：you@example.com）。");
      email.focus();
      return;
    }
    // gmail.con のような打ち間違いらしいときは、送る前に一度止めて確かめてもらう
    const fix = form.dataset.checked === email.value ? "" : suggestEmail(email.value);
    if (fix) {
      const typed = email.value;
      msg.textContent = EN ? `Did you mean ${fix}? ` : `「${fix}」の間違いではありませんか？ `;
      msg.append(
        msgButton(EN ? "Use this address" : "このアドレスに直す", () => { email.value = fix; form.dataset.checked = fix; msg.textContent = ""; form.requestSubmit(); }),
        " ",
        msgButton(EN ? `Keep ${typed}` : "入力したまま登録する", () => { form.dataset.checked = typed; msg.textContent = ""; form.requestSubmit(); }),
      );
      email.focus();
      return;
    }
    const agreeEl = form.querySelector("#agree");
    if (agreeEl && !agreeEl.checked) {
      msg.textContent = (EN ? "Please agree to the Privacy Policy to sign up." : "登録には、プライバシーポリシーへの同意が必要です。");
      agreeEl.focus();
      return;
    }
    const prefEl = form.querySelector("#pref"), trialEl = form.querySelector("#trial-opt");
    const data = {
      email: email.value.trim(),
      prefecture: prefEl ? prefEl.value.trim() : "",
      lang: EN ? "en" : "ja",
      trial: trialEl ? trialEl.checked : false,
      source: form.id === "hero-form" ? "hero" : "bottom",
      // 1枚目のどのパターンを見て登録したか（URL の ?h= で選んで見た人は、末尾に -url を付けて、自然に来た人と分ける）
      variant: heroVariant(),
      // 見ている環境と、ページを開いてから登録するまでの秒数
      device: Object.assign(deviceInfo(), { seconds: Math.round((Date.now() - OPENED_AT) / 1000) }),
      // 経路：最初に来たときの ?from=、参照元のサイト、紹介してくれた人のコード。それと、この人自身の紹介コード
      from: arrival.from || "",
      site: arrival.site || "",
      invitedBy: arrival.r && arrival.r !== store_.get(CODE_KEY) ? arrival.r : "",
      code: myCode(),
      // 同意の記録：下のフォームはチェックボックス、1枚目は登録欄の下の案内文。どの版のポリシーかも送る
      consent: agreeEl ? "checkbox" : "notice",
      policy: POLICY_VERSION,
      createdAt: new Date().toISOString(),
    };
    btn.disabled = true;
    msg.textContent = (EN ? "Registering…" : "登録しています…");
    const s = await ready;
    if (!s) {
      msg.textContent = (EN ? "Registrations can’t be saved from this view. Please register from the published page." : "この画面からは登録を保存できません。公開ページから登録してください。");
      btn.disabled = false;
      return;
    }
    if (s.viewOnly) {
      msg.textContent = (EN ? "View-only access can’t register. Ask the person who shared this page for access that allows registering." : "閲覧のみの共有では登録できません。ページの共有者に、登録できる権限を依頼してください。");
      btn.disabled = false;
      return;
    }
    if (s.endpoint) {
      try {
        // Apps Script は別のドメインなので、事前確認のいらない text/plain で送る。
        // 返事（{"ok":true}）まで読んで、スプレッドシートに保存できたことを確かめてから「登録済み」にする
        const res = await fetch(s.endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(data) });
        const text = await res.text();
        let out = null;
        try { out = JSON.parse(text); } catch (_) { /* JSON でない返事は、Apps Script のエラー画面かログイン画面 */ }
        if (!out || !out.ok) {
          console.error("Pre-order not saved:", res.status, out || text.slice(0, 300));
          msg.textContent = out && out.error === "bad_email"
            ? (EN ? "Please check your email address (for example, you@example.com)." : "メールアドレスの形を確認してください（例：you@example.com）。")
            : (EN ? "Registration didn’t go through. Please try again in a little while." : "登録できませんでした。時間をおいて、もう一度お試しください。");
          btn.disabled = false;
          return;
        }
        // 前に登録していた人は、そのときの紹介コードを使い続ける
        if (out.code) store_.set(CODE_KEY, out.code);
        if (out.number) store_.set(NUM_KEY, String(out.number));
        if (out.number && !store_.get(DAY_KEY)) { const d = new Date(); store_.set(DAY_KEY, d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0")); }
        // ブラウザには「登録済み」の印と紹介コードだけを残す（メールアドレスは残さない）
        store_.set(SENT_KEY, "1");
        store_.set(MAIL_KEY, data.email);
        showDone(data);
        converted();
      } catch (err) {
        // 公開の設定が「全員」でないと、Google のログイン画面に飛ばされてここに来る
        console.error("Pre-order request failed:", err);
        msg.textContent = (EN ? "Registration didn’t go through. Check your connection and try again." : "登録できませんでした。通信状態を確かめて、もう一度お試しください。");
        btn.disabled = false;
      }
      return;
    }
    try {
      await s.ref.set(data);
      showDone(data);
    } catch (err) {
      const code = err && err.code;
      msg.textContent =
        code === "not_granted" || code === "capability_disabled" || code === "capability_removed" || code === "revoked"
          ? (EN ? "You can’t register from this view. Please sign in and open the page again." : "この閲覧方法では登録できません。サインインした状態で開き直してください。")
          : code === "quota_exceeded"
          ? (EN ? "Registration is full for now, so it can’t be accepted." : "受付の上限に達したため、いまは登録できません。")
          : (EN ? "Registration didn’t go through. Check your connection and try again." : "登録できませんでした。通信状態を確かめて、もう一度お試しください。");
      btn.disabled = false;
    }
  }));
})();

/* 先行予約ボタン：カーソルを追う光と、近づくと少し寄ってくる動き（マウスのときだけ） */
(() => {
  const btns = [...document.querySelectorAll(".btn-cta")];
  if (!btns.length || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const REACH = 70, PULL = 0.22, MAX = 8;
  let x = 0, y = 0, queued = false;
  const update = () => {
    queued = false;
    btns.forEach((b) => {
      const r = b.getBoundingClientRect();
      const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
      const near = Math.abs(dx) < r.width / 2 + REACH && Math.abs(dy) < r.height / 2 + REACH;
      if (near && !b.disabled) {
        const max = b.closest(".hd-form") ? 2 : MAX; // 入力欄の中では、はみ出さない程度に
        const clamp = (v) => Math.max(-max, Math.min(max, v * PULL));
        b.style.setProperty("--tx", clamp(dx) + "px");
        b.style.setProperty("--ty", clamp(dy) + "px");
        b.style.setProperty("--mx", (x - r.left) + "px");
        b.style.setProperty("--my", (y - r.top) + "px");
        b.classList.add("is-magnet");
      } else if (b.classList.contains("is-magnet")) {
        b.style.setProperty("--tx", "0px");
        b.style.setProperty("--ty", "0px");
        b.classList.remove("is-magnet");
      }
    });
  };
  document.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    x = e.clientX; y = e.clientY;
    if (!queued) { queued = true; requestAnimationFrame(update); }
  }, { passive: true });
  document.addEventListener("mouseleave", () => { x = y = -9999; update(); });
})();

/* スマホで下まで読み進めた人が、上に戻らずに登録できるように、画面の下に小さく登録ボタンを出す。
   1枚目の登録欄と、最後の登録欄が見えているあいだと、登録したあとは出さない */
(() => {
  const EN = document.documentElement.lang === "en";
  const hero = document.getElementById("hero-form"), signup = document.getElementById("signup");
  if (!hero || !signup || !("IntersectionObserver" in window)) return;
  const bar = document.createElement("div");
  bar.className = "sticky-cta";
  bar.innerHTML = '<a class="btn btn-cta" href="#signup"><span class="btn-dot" aria-hidden="true"></span><span class="btn-label"></span></a>';
  bar.querySelector(".btn-label").textContent = EN ? "See it first (free)" : "完成品を最初に見る（無料）";
  document.body.append(bar);
  // 出すのは、物語を読み終えて製品の節（#phone）に来てから。それまでは物語の邪魔をしない。
  // ほかの登録ボタン（「先行体験に申し込む」など）が見えているあいだも、黒いボタンが2つ並ばないように隠す
  const about = document.getElementById("phone");
  const seen = { hero: true, signup: false, before: true, other: 0 };
  const update = () => bar.classList.toggle("is-on", !seen.hero && !seen.signup && !seen.before && !seen.other && !hero.hidden);
  if (about) new IntersectionObserver((es) => es.forEach((e) => { seen.before = e.boundingClientRect.top > window.innerHeight * 0.5; update(); }), { threshold: [0, 0.25, 0.5, 1] }).observe(about);
  else seen.before = false;
  const others = new Set();
  const oio = new IntersectionObserver((es) => es.forEach((e) => { e.isIntersecting ? others.add(e.target) : others.delete(e.target); seen.other = others.size; update(); }));
  document.querySelectorAll("main .btn-cta").forEach((b) => { if (!b.closest("#hero-form") && !b.closest("#signup")) oio.observe(b); });
  new IntersectionObserver((es) => es.forEach((e) => { seen.hero = e.isIntersecting; update(); })).observe(hero);
  // 登録欄を過ぎてフッターまで来たときも、出さない（フッターの文字を隠さないため）
  new IntersectionObserver((es) => es.forEach((e) => { seen.signup = e.isIntersecting || e.boundingClientRect.top < 0; update(); }), { rootMargin: "0px 0px -20% 0px" }).observe(signup);
  document.addEventListener("soto:registered", update);
})();

/* 「先行体験に申し込む」から来た人は、登録欄の「先行体験にも参加したい」に最初からチェックを入れておく */
(() => {
  const box = document.getElementById("trial-opt");
  document.querySelectorAll("a[data-trial]").forEach((a) => a.addEventListener("click", () => { if (box && box.type === "checkbox") box.checked = true; }));
})();

/* 物語の言葉と絵（165分、42日、3枚の絵、残るのは…、一日の場面）は、画面の真ん中の帯に入っているあいだだけ見せる。
   余白を含んだ箱ではなく、中の言葉と絵そのものの位置で判定する（箱で見ると、隣の言葉と同時に見えてしまう） */
(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const els = [...document.querySelectorAll("#problem .year-bridge, #problem .drawn, #problem > .wrap.center:last-child, .day-panel .day-cap")];
  if (!els.length) return;
  els.forEach((el) => el.classList.add("solo"));
  document.documentElement.classList.add("js-solo");
  const span = (el) => {
    const kids = el.children.length ? [...el.children] : [el];
    let top = Infinity, bottom = -Infinity;
    kids.forEach((k) => { const r = k.getBoundingClientRect(); if (r.height) { top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom); } });
    return [top, bottom];
  };
  let queued = false;
  const update = () => {
    queued = false;
    const h = window.innerHeight, bandTop = h * 0.3, bandBottom = h * 0.7;
    els.forEach((el) => { const [t, b] = span(el); el.classList.toggle("is-solo", b > bandTop && t < bandBottom); });
  };
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();
})();

/* 登録人数：確認メールが届いた人だけを数えた数（Apps Script の verifiedCount）を、最後の登録欄の上に出す。
   少ないうちは逆効果なので、SHOW_FROM 人を超えるまでは出さない。最後の登録欄に近づいたときに一度だけ取りに行く */
(() => {
  const EN = document.documentElement.lang === "en";
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbwa7cTRb-GxlCZKVGaWIP2FuVBQFpsDR7FpMjVoYrGJ9G6EyfLiTS_iIfux6H1iVB0Y/exec";
  const SHOW_FROM = 100;
  const form = document.getElementById("reserve-form");
  if (!form || window.claude || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(async (es) => {
    if (!es.some((e) => e.isIntersecting)) return;
    io.disconnect();
    try {
      const res = await fetch(ENDPOINT);
      const n = Number((await res.json()).count);
      if (!(n >= SHOW_FROM)) return;
      const p = document.createElement("p");
      p.className = "reg-count";
      p.textContent = EN ? `${n.toLocaleString("en")} people have signed up.` : `${n.toLocaleString("ja")}人が登録しています。`;
      form.before(p);
    } catch (_) { /* 数が取れなくても登録はできる */ }
  }, { rootMargin: "600px 0px" });
  io.observe(form);
})();

/* 動画の道の続き：1枚目の動画の下から、紙の上を左右に曲がりながら、景色の入口（製品の節 #phone）まで下りていく道。
   道は文字の上を通らないよう、本文の外の余白を縦に走り、節と節のあいだの余白で反対側へ渡る。
   スクロールした分だけ、画面の下のほうまで描き進める。「動きを減らす」設定のときは、最初から全部描いておく */
(() => {
  const svg = document.querySelector(".road");
  const main = document.getElementById("main");
  const ids = ["top", "problem", "ink", "phone"];
  const secs = ids.map((id) => document.getElementById(id));
  if (!svg || secs.some((s) => !s)) return;
  const video = document.querySelector(".hd-media");
  const paths = svg.querySelectorAll(".road-shadow, .road-edge, .road-body");
  const reveal = svg.querySelector(".road-reveal");
  const grad = svg.querySelector(".road-grad");
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let len = 0, top0 = 0, endY = 0;

  // 点を通るなめらかな曲線（Catmull-Rom を3次ベジェに直す）
  const smooth = (p) => {
    let d = `M${p[0][0]},${p[0][1]}`;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
      d += ` C${b[0] + (c[0] - a[0]) / 6},${b[1] + (c[1] - a[1]) / 6} ${c[0] - (e[0] - b[0]) / 6},${c[1] - (e[1] - b[1]) / 6} ${c[0]},${c[1]}`;
    }
    return d;
  };


  // 狭い画面：文字や絵がある高さを調べ、そのあいだの余白（文字のない高さ）で左右を渡る。
  // 文字のある高さでは、画面のふち（本文の外）だけを走る
  const narrowRoute = (W, L, R, hero, about, mainTop) => {
    const spans = [];
    secs.slice(1, -1).forEach((sec) => {
      sec.querySelectorAll("*").forEach((el) => {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own && !/^(IMG|VIDEO|CANVAS|svg|BUTTON|INPUT|SELECT|FIGURE)$/.test(el.tagName)) return;
        const r = el.getBoundingClientRect();
        if (r.height < 1 || r.width < 1) return;
        spans.push([r.top + scrollY - mainTop, r.bottom + scrollY - mainTop]);
      });
    });
    // 1日→一生の場面（.scale）は、マスが細かいので、箱ごと文字のある高さとして扱う
    document.querySelectorAll(".scale").forEach((el) => { const r = el.getBoundingClientRect(); spans.push([r.top + scrollY - mainTop, r.bottom + scrollY - mainTop]); });
    spans.sort((a, b) => a[0] - b[0]);
    const MIN_GAP = 140; // これより狭い余白では渡らない
    const blocks = [];
    spans.forEach(([a, b]) => {
      const last = blocks[blocks.length - 1];
      if (last && a - last[1] < MIN_GAP) last[1] = Math.max(last[1], b); else blocks.push([a, b]);
    });
    const pts = [[W * 0.5, hero.b - 6]];
    let x = L;
    blocks.forEach(([a, b], i) => {
      const prevEnd = i ? blocks[i - 1][1] : hero.b;
      const gap = a - prevEnd;
      if (i) x = x === L ? R : L;                                   // 余白ごとに、反対側へ
      pts.push([x, a - Math.min(40, gap * 0.2)]);
      if (b - a > 260) pts.push([x + (x === L ? 3 : -3), (a + b) / 2]);
      pts.push([x, b + Math.min(40, gap * 0.2)]);
    });
    pts.push([W * 0.5, about.t + 60]);
    return pts;
  };

  // 狭い画面の道：縦の区間はまっすぐ下り、左右を渡るところは、上下に向いたS字でつなぐ（短い区間でも輪にならない）
  const sCurve = (p) => {
    let d = `M${p[0][0]},${p[0][1]}`;
    for (let i = 1; i < p.length; i++) {
      const [ax, ay] = p[i - 1], [bx, by] = p[i], h = (by - ay) / 2;
      d += ` C${ax},${ay + h} ${bx},${by - h} ${bx},${by}`;
    }
    return d;
  };

  const build = () => {
    const W = document.documentElement.clientWidth;
    const mainTop = main.getBoundingClientRect().top + scrollY;
    const box = (el) => { const r = el.getBoundingClientRect(); return { t: r.top + scrollY - mainTop, b: r.bottom + scrollY - mainTop }; };
    const [hero, problem, ink, about] = secs.map(box);
    const wrapW = Math.min(W - 2 * Math.min(Math.max(20, W * 0.06), 96), 1120);
    const margin = (W - wrapW) / 2;
    const wide = margin >= 90;
    const width = wide ? 30 : 12;                       // 道の幅
    const L = wide ? margin * 0.5 : 12, R = W - L;      // 左右の余白の真ん中を走る
    const wob = wide ? 14 : 3;                          // 縦に走るところの、ゆるい揺れ
    const v = video ? video.getBoundingClientRect() : null;
    const startX = v ? v.left + v.width * 0.62 : W * 0.7;
    const startY = v ? v.bottom + scrollY - mainTop - v.height * 0.06 : hero.b - 120; // 動画の下のぼかしの中から出てくる
    // 広い画面：動画の下からまず左の余白へ回り、そのあと右、と交互に走って、節のあいだで渡る。狭い画面：文字に重ならないよう、左のふちだけを下りる
    // 広い画面：動画の下から、「昨日、スマホを何時間見ていましたか。」の見出しの上を斜めに横切って左の余白へ回り、
    // そのあと右、と交互に走って、節のあいだで渡る。狭い画面：文字に重ならないよう、左のふちだけを下りる
    const qa = document.querySelector("#problem .sc-ask");
    const qr = qa && qa.getBoundingClientRect();
    const q = qr && qr.height ? { l: qr.left, r: qr.right, t: qr.top + scrollY - mainTop, b: qr.bottom + scrollY - mainTop } : null;
    // 見出しは、真横ではなく斜めに横切る（何文字かだけ重なり、読めるまま目が止まるように）。途中にも点を置いて、まっすぐに保つ
    const cross = (x1, y1, x2, y2) => [0, 0.5, 1].map((t) => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
    let routeFade = 90;
    const ask = wide && document.querySelector(".hero-door .done .done-ask");
    let pts;
    if (!wide) pts = narrowRoute(W, L, R, hero, about, mainTop);
    else if (ask && ask.offsetParent) {
      // 登録したあと：右上（携帯の絵の「電話」のあたり）から、まっすぐ斜めに下りて「ご紹介のお願い」（10名のあたり）を横切り、
      // 左の余白でゆるく折り返して、見出しの上を左から右へ斜めに横切る。そのあとは右、左、と下りる。
      // 重なると目が止まり、もう一度見てもらえるため（狭い画面は、もともとカードの上を通る）
      const r = ask.getBoundingClientRect(), at = r.top + scrollY - mainTop;
      const ax = r.right + Math.min(520, W * 0.32), ay = at + r.height * 0.18;
      const bx = r.left - 60, by = at + r.height * 0.74;
      const k = (by - ay) / (bx - ax);
      const sx = ax + 260, sy = ay + k * 260;                // 出だしは右上の先から、だんだん見えてくるように
      pts = [[sx, sy], [ax, ay], [bx, by]];
      if (q) {
        pts.push([L + wob, Math.max(by + 200, q.t - 420)], ...cross(q.l - 200, q.t - 130, q.r + 200, q.b + 130));
        const y1 = Math.max(problem.t + 260, q.b + 380);
        pts.push([R - wob, y1], [R + wob, (y1 + problem.b) / 2], [R - wob, problem.b - 160],
          [W * 0.5, ink.t + 20],
          [L + wob, ink.t + 300], [L, ink.b - 200],
          [W * 0.4, about.t - 30], [W * 0.5, about.t + 60]);
      } else {
        pts.push([L + wob, by + Math.max(320, (bx - L) * 2.2)], [L - wob, (problem.t + problem.b) / 2], [L + wob, problem.b - 160],
          [W * 0.5, ink.t + 20], [R - wob, ink.t + 300], [R, ink.b - 200], [W * 0.6, about.t - 30], [W * 0.5, about.t + 60]);
      }
      routeFade = 260;
    } else {
      pts = [[startX, startY]];
      if (q) pts.push(...cross(q.r + 200, q.t - 130, q.l - 200, q.b + 130)); else pts.push([W * 0.45, hero.b + 10]);
      const y1 = q ? Math.max(problem.t + 260, q.b + 380) : problem.t + 260;
      pts.push([L + wob, y1], [L - wob, (y1 + problem.b) / 2], [L + wob, problem.b - 160],
        [W * 0.5, ink.t + 20],
        [R - wob, ink.t + 300], [R, ink.b - 200],
        [W * 0.6, about.t - 30], [W * 0.5, about.t + 60]);
    }
    const d = wide ? smooth(pts) : sCurve(pts);
    endY = about.t + 60;
    svg.setAttribute("viewBox", `0 0 ${W} ${endY + 40}`);
    svg.style.height = `${endY + 40}px`;
    paths.forEach((p) => p.setAttribute("d", d));
    reveal.setAttribute("d", d);
    svg.style.setProperty("--road-w", `${width}px`);
    reveal.setAttribute("stroke-width", width * 3);
    // 出だしは動画のぼかしから、終わりは景色の中へ、どちらも少しずつ消す
    const y0 = Math.min(...pts.map((q) => q[1])) - 30; // 登録後にカードの上へ戻る道も、消えないように
    grad.setAttribute("y1", y0); grad.setAttribute("y2", endY);
    grad.querySelector(".road-in").setAttribute("offset", Math.min(0.2, routeFade / (endY - y0)));
    len = reveal.getTotalLength();
    reveal.style.strokeDasharray = `${len} ${len}`;
    top0 = mainTop;
    draw();
  };

  // 画面の下から3割の高さまで、道を描き進める
  const draw = () => {
    if (!len) return;
    if (still) { reveal.style.strokeDashoffset = 0; return; }
    const front = scrollY + innerHeight * 0.7 - top0;
    // 道の長さのうち、front より上にある分を二分探索で求める
    let lo = 0, hi = len;
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (reveal.getPointAtLength(m).y < front) lo = m; else hi = m; }
    reveal.style.strokeDashoffset = len - lo;
  };

  let raf = 0;
  addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }, { passive: true });
  let t;
  addEventListener("resize", () => { clearTimeout(t); t = setTimeout(build, 150); });
  addEventListener("load", build);
  document.addEventListener("soto:registered", () => setTimeout(build, 500)); // 登録してカードの高さが変わったら、道を引き直す
  if (document.fonts) document.fonts.ready.then(build);
  build();
})();


/* スクリーンタイムの場面：グラフの棒の高さを決める。＋−のボタンで、15分ずつ時間を変えられる（最初は全国平均の2時間45分）。
   一生は、15歳から80歳まで同じ時間を見た場合の計算（出典の行に書いた前提） */
(() => {
  const sc = document.getElementById("scale");
  const note = sc && sc.querySelector(".st-note");
  if (!note) return;
  const EN = document.documentElement.lang === "en";
  const $ = (id) => document.getElementById(id);
  const hm = (m) => { const h = Math.floor(m / 60), r = m % 60; return EN ? (h ? `${h}h${r ? ` ${r}m` : ""}` : `${r}m`) : (h ? `${h}時間${r ? `${r}分` : ""}` : `${r}分`); };
  const unit = (n, u) => (EN ? `${n} ${n === "1" ? u.replace(/s$/, "") : u}` : `${n}${u}`);
  const life = (m) => {
    const y = m * 365 / 60 / 24 * 65 / 365;
    if (y < 1) return unit(String(Math.max(1, Math.round(y * 12))), EN ? "months" : "か月");
    const half = Math.round(y * 2) / 2;
    if (EN) return unit(String(half), "years");
    return Number.isInteger(half) ? `${half}年` : `${Math.floor(half)}年半`;
  };
  // 1週間の棒は、昨日（右端）を基準に少しずつばらつかせる
  const F = [0.8, 1.15, 0.9, 1.25, 0.95, 1.1, 1];
  const bars = sc.querySelectorAll(".st-chart b");
  const btns = sc.querySelectorAll(".st-btn");
  let m = 165;
  const render = () => {
    $("st-day").textContent = hm(m);
    $("st-life").textContent = life(m);
    // 下の一文（「その7年半に…」）も、同じ数字にそろえる
    document.querySelectorAll(".st-life-ref").forEach((el) => { el.textContent = life(m); });
    const max = Math.max(m * 1.25, 240);
    bars.forEach((b, i) => { b.style.height = `${(m * F[i] / max) * 100}%`; });
    btns.forEach((b) => { b.disabled = b.dataset.d < 0 ? m <= 15 : m >= 600; });
    // 平均から動かしたら、平均の行は比べる相手として残す
    const avg = $("st-avg");
    if (avg) avg.textContent = m === 165 ? (EN ? "National average (ages 15–69)" : "全国平均（15〜69歳）") : (EN ? "National average: 2h 45m" : "全国平均は2時間45分");
  };
  btns.forEach((b) => b.addEventListener("click", () => {
    m = Math.min(600, Math.max(15, m + Number(b.dataset.d)));
    render();
    note.classList.remove("is-bump"); void note.offsetWidth; note.classList.add("is-bump");
  }));
  render();
})();

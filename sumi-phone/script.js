(() => {
  const EN = document.documentElement.lang === "en";
  const nav = document.querySelector(".nav");

  // 1枚目の絵（写真をもとにした水彩）を風で揺らす：山と空と草は止めたまま、木だけを WebGL でゆらゆらと動かす。
  // WebGL が使えないとき、「動きを減らす」設定のとき、画面に見えていないときは動かさない（写真はそのまま見える）
  (() => {
    const box = document.querySelector(".hd-photo");
    const canvas = box && box.querySelector(".hd-wind");
    const img = box && box.querySelector("img");
    if (!canvas || !img || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) return;
    const vs = "attribute vec2 p; varying vec2 v; void main(){ v = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }";
    const fs = `precision mediump float;
      uniform sampler2D tex; uniform vec2 res; uniform vec2 size; uniform float time; varying vec2 v;
      // 緑っぽさ（緑 − 青）。木と草は正、空・山・雪・岩は 0 以下になる
      float green(vec2 p){ vec3 c = texture2D(tex, p).rgb; return c.g - c.b; }
      void main(){
        // 写真を画面いっぱいに（object-fit: cover と同じ）。少しだけ大きくして、端が揺れても切れないようにする
        float s = max(res.x / size.x, res.y / size.y) * 1.02;
        vec2 uv = (v * res - (res - size * s) * .5) / (size * s);
        float x = uv.x, y = uv.y;
        // 揺れるのは緑のところだけ。まわりを少しぼかして見て、木の輪郭ごとなめらかに動かす（空や山、岩は止まったまま）
        vec2 r = vec2(14., 14.) / size;
        float g = green(uv) * .2;
        g += (green(uv + vec2(r.x, 0.)) + green(uv - vec2(r.x, 0.)) + green(uv + vec2(0., r.y)) + green(uv - vec2(0., r.y))) * .12;
        g += (green(uv + r) + green(uv - r) + green(uv + vec2(r.x, -r.y)) + green(uv + vec2(-r.x, r.y))) * .08;
        float plant = smoothstep(.0, .09, g);
        // 風は左から吹く。大きなうねりが画面を横切っていき、ときどき強まる
        float gust = .65 + .35 * sin(time * .23 + 1.1);
        float wind = sin(time * .9 - x * 2.4) * .75 + sin(time * 1.7 - x * 4.3 + 1.7) * .25;
        // 木：根もとは動かず、上ほど大きく揺れる。手前の草のあたり（画面の下の方）は動かさない
        float tip = clamp((.95 - y) / .65, 0., 1.);
        float still = 1. - smoothstep(.66, .78, y);
        uv.x += plant * tip * tip * still * wind * gust * .0042;
        uv = clamp(uv, .001, .999);
        vec3 c = texture2D(tex, uv).rgb;
        // 左の太陽の光が、ゆっくり呼吸する
        float d = distance(vec2(x * size.x / size.y, y), vec2(0., .36));
        c += vec3(1., .9, .7) * (.035 + .025 * sin(time * .45)) * exp(-d * 5.);
        gl_FragColor = vec4(c, 1.);
      }`;
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; };
    const a = sh(gl.VERTEX_SHADER, vs), b = sh(gl.FRAGMENT_SHADER, fs);
    if (!a || !b) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, a); gl.attachShader(prog, b); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n) => gl.getUniformLocation(prog, n);
    const uRes = U("res"), uSize = U("size"), uTime = U("time");
    let ready = false, visible = true, raf = 0;
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.round(box.clientWidth * dpr), h = Math.round(box.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uRes, w, h);
    }
    function frame(t) {
      raf = 0;
      if (!ready || !visible || document.hidden) return;
      gl.uniform1f(uTime, t / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(frame);
    }
    const start = () => { if (!raf) raf = requestAnimationFrame(frame); };
    function load() {
      // 画面の大きさに合った方の写真（srcset で選ばれたもの）を使う
      const src = new Image();
      src.onload = () => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src); } catch (_) { return; /* 読めないときは写真のまま */ }
        gl.uniform2f(uSize, src.naturalWidth, src.naturalHeight);
        resize();
        ready = true;
        box.classList.add("is-live");
        start();
      };
      src.src = img.currentSrc || img.src;
    }
    if (img.complete && img.naturalWidth) load(); else img.addEventListener("load", load, { once: true });
    window.addEventListener("resize", () => { if (ready) { resize(); start(); } });
    document.addEventListener("visibilitychange", start);
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; start(); }).observe(box);
  })();

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
    panels.forEach((p) => { if (p.getBoundingClientRect().top <= mid) active = p; });
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
  const POLICY_VERSION = "2026-10-14";
  const SENT_KEY = "soto-preorder";
  const CODE_KEY = "soto-code"; // この人の紹介コード（友だちに送るリンクに付ける。メールアドレスとは結びつけて残さない）
  const FROM_KEY = "soto-from"; // 最初に来たときの経路（?from= と、どのサイトから来たか）
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
    if (!first || (!first.from && !first.site && !first.r && (from || site || r))) {
      first = { from, site, r };
      store_.set(FROM_KEY, JSON.stringify(first));
    } else if (r && !first.r) {
      // 前に検索などで一度来ていた人が、あとから紹介のリンクで来たときも、紹介は記録する（経路は最初のまま）
      first.r = r;
      store_.set(FROM_KEY, JSON.stringify(first));
    }
    return first;
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
        if (saved) showDone({});
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

  // どちらかで登録できたら、両方のフォームを「登録済み」にする
  function showDone(data) {
    forms.forEach(({ form, msg }) => {
      form.hidden = true;
      msg.textContent = data.email
        ? (EN ? `You’re registered for pre-order (${data.email}). We’ll email this address when it launches.` : `先行予約に登録済みです（${data.email}）。発売が決まったら、このアドレスにお知らせします。`)
        : (EN ? "You’re registered for pre-order. We’ll email you when it launches." : "先行予約に登録済みです。発売が決まったら、メールでお知らせします。");
      // アドレスを打ち間違えても、確認メールが届かないだけで気づけない。いつでも登録し直せるようにする
      msg.append(" ", msgButton(EN ? "Wrong address? Register again" : "アドレスを間違えたときは、登録し直す", reopen));
      if (!msg.nextElementSibling || !msg.nextElementSibling.classList.contains("share")) {
        msg.after(shareBox());
      }
    });
    document.dispatchEvent(new Event("soto:registered"));
    document.querySelectorAll(".hd-fine").forEach((el) => { el.hidden = true; });
  }

  // 登録済みの表示を消して、もう一度入力できる状態に戻す（前の登録はスプレッドシートに残る）
  function reopen() {
    try { localStorage.removeItem(SENT_KEY); } catch (_) { /* 覚えていなくても入力はできる */ }
    forms.forEach(({ form, msg }) => {
      if (msg.nextElementSibling && msg.nextElementSibling.classList.contains("share")) msg.nextElementSibling.remove();
      form.hidden = false;
      delete form.dataset.checked;
      form.querySelector("button[type=submit]").disabled = false;
      msg.textContent = "";
    });
    document.querySelectorAll(".hd-fine").forEach((el) => { el.hidden = false; });
    const first = forms[0] && forms[0].form.querySelector("input[type=email]");
    if (first) first.focus();
  }

  // 登録のすぐあとに、友だちに教えてもらう。リンクには紹介コードが付き、そこから登録した人の行に「紹介」として残る
  function shareBox() {
    const url = "https://sotophone.jp/" + (EN ? "en.html" : "") + "?r=" + myCode();
    const text = EN ? "A phone that makes you want to go outside. Soto Phone is taking pre-orders." : "スマホを置いて、外に出たくなる携帯。Soto Phone の先行予約が始まっています。";
    const box = document.createElement("div");
    box.className = "share";
    const head = document.createElement("p");
    head.className = "share-head";
    head.textContent = EN ? "Know someone who’d want this? Send them the link." : "気になりそうな友だちにも、教えてもらえるとうれしいです。";
    const row = document.createElement("div");
    row.className = "share-row";
    const link = (label, href) => {
      const a = document.createElement("a");
      a.className = "share-btn"; a.href = href; a.target = "_blank"; a.rel = "noopener"; a.textContent = label;
      return a;
    };
    const btn = (label, onClick) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "share-btn"; b.textContent = label;
      b.addEventListener("click", () => onClick(b));
      return b;
    };
    if (navigator.share) {
      row.append(btn(EN ? "Share" : "共有する", () => navigator.share({ title: "Soto Phone", text, url }).catch(() => {})));
    }
    row.append(
      link("LINE", "https://line.me/R/share?text=" + encodeURIComponent(text + "\n" + url)),
      link("X", "https://x.com/intent/post?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(url)),
      btn(EN ? "Copy link" : "リンクをコピー", async (b) => {
        try { await navigator.clipboard.writeText(url); } catch (_) { window.prompt(EN ? "Copy this link" : "このリンクをコピーしてください", url); return; }
        b.textContent = EN ? "Copied" : "コピーしました";
        setTimeout(() => { b.textContent = EN ? "Copy link" : "リンクをコピー"; }, 2000);
      }),
    );
    box.append(head, row);
    return box;
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
        // ブラウザには「登録済み」の印と紹介コードだけを残す（メールアドレスは残さない）
        store_.set(SENT_KEY, "1");
        showDone(data);
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
  bar.querySelector(".btn-label").textContent = EN ? "Join the pre-order list (free)" : "先行予約に登録する（無料）";
  document.body.append(bar);
  // 出すのは、物語を読み終えて「Soto Phone とは」に来てから。それまでは物語の邪魔をしない。
  // ほかの登録ボタン（「先行体験に申し込む」など）が見えているあいだも、黒いボタンが2つ並ばないように隠す
  const about = document.getElementById("about");
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
  const els = [...document.querySelectorAll("#problem > .wrap:first-child, #problem .year, #problem .drawn, #problem > .wrap.center:last-child, .day-panel .day-cap")];
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

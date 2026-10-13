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

  // 色のシーン：白黒の紙に、淡い黄色がにじんで広がり、最初の色として淡く残る（画面に入ったら一度だけ）
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
    const line = ink.querySelector(".ink-line");
    const line2 = ink.querySelector(".ink-line2");
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
      // 文字は墨の下に沈んでいく
      const sink = seg(p, 0.30, 0.50);
      text.style.opacity = (1 - sink).toFixed(3);
      text.style.filter = sink > 0 ? `blur(${(sink * 3).toFixed(1)}px)` : "";
      const say = ease(seg(p, 0.72, 0.84));
      line.style.opacity = say.toFixed(3);
      line.style.top = cy + "px";
      line.style.transform = `translateY(calc(-50% + ${((1 - say) * 12).toFixed(1)}px))`;
      // 少し遅れて「Soto Phone があるじゃん。」
      const say2 = ease(seg(p, 0.84, 0.94));
      line2.style.opacity = say2.toFixed(3);
      line2.style.transform = `translateY(${((1 - say2) * 10).toFixed(1)}px)`;
    }
    // スクロールで引っぱらず、画面に入ったら一度だけ、絵の具がにじむように流れる（約4秒）
    const P0 = 0.24, P1 = 1, DUR = 4200;
    let played = false, shown = P0;
    const play = () => {
      played = true;
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / DUR);
        shown = P0 + (P1 - P0) * k;
        render(shown);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    new IntersectionObserver((es) => {
      if (es[0].isIntersecting && !played) setTimeout(play, 900); // 最初の文を読む時間をおいてから
    }, { threshold: 0.6 }).observe(stage);
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
  const POLICY_VERSION = "2026-10-12";
  const SENT_KEY = "soto-preorder";
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
    });
    document.querySelectorAll(".hd-fine").forEach((el) => { el.hidden = true; });
  }

  forms.forEach(({ form, msg }) => form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.querySelector("input[type=email]");
    const btn = form.querySelector("button[type=submit]");
    if (!email.checkValidity()) {
      msg.textContent = (EN ? "Please check your email address (for example, you@example.com)." : "メールアドレスの形を確認してください（例：you@example.com）。");
      email.focus();
      return;
    }
    const agreeEl = form.querySelector("#agree");
    if (agreeEl && !agreeEl.checked) {
      msg.textContent = (EN ? "Please agree to the Privacy Policy to sign up." : "登録には、プライバシーポリシーへの同意が必要です。");
      agreeEl.focus();
      return;
    }
    const prefEl = form.querySelector("#pref"), trialEl = form.querySelector("#trial");
    const data = {
      email: email.value.trim(),
      prefecture: prefEl ? prefEl.value.trim() : "",
      lang: EN ? "en" : "ja",
      trial: trialEl ? trialEl.checked : false,
      source: form.id === "hero-form" ? "hero" : "bottom",
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
        // ブラウザには「登録済み」の印だけを残す（メールアドレスは残さない）
        try { localStorage.setItem(SENT_KEY, "1"); } catch (_) { /* 覚えられなくても登録は済んでいる */ }
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

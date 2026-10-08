(() => {
  const layers = document.querySelectorAll(".bg-layer");
  const panels = document.querySelectorAll("main [data-bg]");
  const sceneLinks = document.querySelectorAll(".scenes a");
  const nav = document.querySelector(".nav");

  // スクロール位置に応じて背景を切り替える：画面中央にあるセクションの画像を表示
  let current = -1;
  function setScene(i) {
    if (i === current) return;
    current = i;
    layers.forEach((l, n) => l.classList.toggle("is-active", n === i));
    sceneLinks.forEach((a, n) => a.classList.toggle("is-active", n === i));
  }

  function onScroll() {
    const mid = window.innerHeight / 2;
    let active = panels[0];
    panels.forEach((p) => {
      if (p.getBoundingClientRect().top <= mid) active = p;
    });
    setScene(Number(active.dataset.bg));
    // 絵本のページ（紙）では、ナビの文字を墨色にする
    document.body.classList.toggle("paper", active.dataset.tone === "paper");
    nav.classList.toggle("is-scrolled", window.scrollY > 40);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();

  // 朝から夜までの部屋：絵の中で一日がくり返す。窓の外は太陽から月へ、部屋は暗くなり、夜はスマホの光だけが顔を照らす
  const room = document.getElementById("room");
  if (room && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const dark = room.querySelector(".room-dark");
    const sky = room.querySelector(".rw-sky"), sun = room.querySelector(".rw-sun"), night = room.querySelector(".rw-night");
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const seg = (p, a, b) => clamp((p - a) / (b - a));
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const DAY = [243, 242, 237], DUSK = [184, 181, 173], NIGHT = [38, 37, 35];
    const FACE = "26.5% 68%"; // ベッドの顔とスマホのあいだ
    const CYCLE = 9000; // 一日の長さ（ミリ秒）。昼はさっと過ぎ、夜が長く続く
    const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    function render(p) {
      // 朝〜夕方：太陽がさっと昇って沈む
      const sunT = easeIO(seg(p, 0.0, 0.3));
      const sx = 30 + sunT * 140, sy = 125 - Math.sin(sunT * Math.PI) * 95;
      sun.setAttribute("transform", `translate(${sx.toFixed(1)} ${sy.toFixed(1)})`);
      sun.style.opacity = (seg(p, 0.0, 0.03) * (1 - seg(p, 0.27, 0.32))).toFixed(3);
      // 空の色：昼 → 夕方 → 夜 → 夜明け
      const dusk = seg(p, 0.14, 0.3), toNight = seg(p, 0.3, 0.38), dawn = seg(p, 0.93, 1);
      let c = toNight > 0 ? mix(DUSK, NIGHT, toNight) : mix(DAY, DUSK, dusk);
      if (dawn > 0) c = mix(NIGHT, DAY, dawn);
      sky.style.fill = `rgb(${c.join(",")})`;
      night.style.opacity = (seg(p, 0.34, 0.42) * (1 - dawn)).toFixed(3);
      // 部屋の暗さと、顔を照らすスマホの光（少しだけ揺らぐ）
      const a = (0.3 * dusk + 0.55 * toNight) * (1 - dawn);
      const glow = seg(p, 0.38, 0.46) * (1 - dawn) * (0.92 + 0.08 * Math.sin(p * 120));
      const inner = (a * (1 - glow * 0.97)).toFixed(3), mid = (a * (1 - glow * 0.55)).toFixed(3);
      dark.style.background = `radial-gradient(circle at ${FACE}, rgba(14,13,12,${inner}) 0, rgba(14,13,12,${mid}) 9%, rgba(14,13,12,${a.toFixed(3)}) 22%)`;
    }
    let visible = false, start = performance.now(), raf3 = 0;
    const loop = (now) => { render(((now - start) % CYCLE) / CYCLE); raf3 = visible ? requestAnimationFrame(loop) : 0; };
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf3) raf3 = requestAnimationFrame(loop);
    }).observe(room);
    render(0.1);
  }

  // 墨のシーン：墨が一滴落ち、にじんで広がり、集まって Sumi になる
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
    const sumi = ink.querySelector(".ink-sumi");
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
    function render() {
      const r = ink.getBoundingClientRect();
      const p = clamp(-r.top / (r.height - window.innerHeight));
      const R = Math.min(W, Hh) * 0.3;
      // 1. 一滴が落ちる
      const fall = ease(seg(p, 0.10, 0.26));
      drop.style.opacity = p > 0.08 && p < 0.27 ? 1 : 0;
      drop.setAttribute("transform", `translate(${cx} ${-40 + (cy + 40) * fall}) scale(1 ${1 + fall * 0.35})`);
      // 2. 落ちた所からにじんで広がる
      const spread = ease(seg(p, 0.26, 0.48));
      // 4. 墨が集まって消え、Sumi の線になる
      const gather = ease(seg(p, 0.58, 0.80));
      const k = spread * (1 - gather);
      lobes.forEach((c, i) => {
        const [dx, dy, rr] = LOBES[i];
        // 外側の膨らみは少し遅れて広がる
        const ki = i === 0 ? k : ease(seg(p, 0.30 + i * 0.02, 0.50)) * (1 - gather);
        c.setAttribute("cx", (cx + dx * R * ki).toFixed(1));
        c.setAttribute("cy", (cy + dy * R * ki).toFixed(1));
        c.setAttribute("r", (R * rr * ki).toFixed(1));
      });
      halo.setAttribute("cx", cx); halo.setAttribute("cy", cy);
      halo.setAttribute("r", (R * 1.3 * k).toFixed(1));
      halo.style.opacity = (0.28 * (1 - gather)).toFixed(3);
      const splat = seg(p, 0.26, 0.34) * (1 - gather);
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
      sumi.style.left = cx + "px"; sumi.style.top = cy + "px";
      sumi.style.opacity = gather.toFixed(3);
      sumi.style.transform = `translate(-50%, -56%) scale(${(0.86 + gather * 0.14).toFixed(3)})`;
      sumi.style.filter = gather < 1 ? `blur(${((1 - gather) * 4).toFixed(1)}px)` : "";
      const say = ease(seg(p, 0.80, 0.92));
      line.style.opacity = say.toFixed(3);
      line.style.transform = `translateY(${((1 - say) * 12).toFixed(1)}px)`;
      // 少し遅れて「墨Phone があるじゃん。」
      const say2 = ease(seg(p, 0.88, 0.97));
      line2.style.opacity = say2.toFixed(3);
      line2.style.transform = `translateY(${((1 - say2) * 10).toFixed(1)}px)`;
    }
    let raf = 0;
    const queue = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", () => { measure(); queue(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); render(); });
    measure(); render();
  }

  // 文字のフェードイン
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("is-in")),
    { threshold: 0.2 }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  // 画像の先読み
  layers.forEach((l) => {
    const url = l.style.backgroundImage.slice(5, -2).replace(/^"|"$/g, "");
    new Image().src = url;
  });

  // 端末の画面：道具を選ぶと表示が変わる
  const screens = {
    home: `<ul class="home-list"><li>連絡</li><li>移動</li><li>写真</li><li>道具</li><li>音楽</li><li>ポイント</li></ul><div class="small" style="margin-top:12px">次の離れる時間 19:00</div>`,
    contact: `<div class="small">連絡</div><ul style="font-size:17px;margin-top:6px"><li>電話</li><li>電話帳</li><li>SMS</li></ul><div class="small" style="margin-top:12px">未読の数は表示しません</div>`,
    go: `<div class="small">移動</div><div class="mid" style="margin:6px 0">次の角を<br>左へ 120m</div><div class="small">乗換案内 ・ 天気</div>`,
    record: `<div class="photo" role="img" aria-label="カメラで撮ったカラー写真"></div><div class="small">写真だけは、カラーで。</div>`,
    away: `<div class="small">離れる時間</div><div class="mid" style="margin:6px 0">夕食 19:00–20:00</div><div class="small">届くのは家族と緊急の連絡だけ<br>電話と地図は使えます</div><div class="pill">あと 5 分だけ使う</div>`,
  };
  const body = document.getElementById("screen-body");
  const tabs = document.querySelectorAll(".tool-list button");
  function show(tool) {
    body.innerHTML = screens[tool] || screens.home;
    body.classList.remove("swap");
    void body.offsetWidth;
    body.classList.add("swap");
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tool === tool)));
  }
  tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.tool)));
  body.innerHTML = screens.home;

  // 時計
  const clock = document.getElementById("screen-time");
  const tick = () => {
    const d = new Date();
    clock.textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  tick();
  setInterval(tick, 30000);

  // 先行予約フォーム
  // claude.ai で公開したページでは、登録をページのデータベース（preorders/<登録者ID>）に保存する。
  // それ以外（ファイルを直接開いた場合など）では保存先がないため、その旨を表示する。
  const PREFS = "北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県 海外".split(" ");
  const form = document.getElementById("reserve-form");
  const msg = document.getElementById("form-msg");
  const btn = document.getElementById("reserve-btn");
  const pref = document.getElementById("pref");
  PREFS.forEach((p) => pref.add(new Option(p, p)));

  let store = null; // { db, path } once the page database is available
  const ready = (async () => {
    if (!window.claude) return null;
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

  function showDone(data) {
    form.hidden = true;
    msg.textContent = `先行予約に登録済みです（${data.email}）。発売が決まったら、このアドレスにお知らせします。`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.querySelector("#email");
    if (!email.checkValidity()) {
      msg.textContent = "メールアドレスの形を確認してください（例：you@example.com）。";
      email.focus();
      return;
    }
    const data = {
      email: email.value.trim(),
      prefecture: pref.value,
      trial: form.querySelector("#trial").checked,
      createdAt: new Date().toISOString(),
    };
    btn.disabled = true;
    msg.textContent = "登録しています…";
    const s = await ready;
    if (!s) {
      msg.textContent = "この画面からは登録を保存できません。公開ページから登録してください。";
      btn.disabled = false;
      return;
    }
    if (s.viewOnly) {
      msg.textContent = "閲覧のみの共有では登録できません。ページの共有者に、登録できる権限を依頼してください。";
      btn.disabled = false;
      return;
    }
    try {
      await s.ref.set(data);
      showDone(data);
    } catch (err) {
      const code = err && err.code;
      msg.textContent =
        code === "not_granted" || code === "capability_disabled" || code === "capability_removed" || code === "revoked"
          ? "この閲覧方法では登録できません。サインインした状態で開き直してください。"
          : code === "quota_exceeded"
          ? "受付の上限に達したため、いまは登録できません。"
          : "登録できませんでした。通信状態を確かめて、もう一度お試しください。";
      btn.disabled = false;
    }
  });
})();

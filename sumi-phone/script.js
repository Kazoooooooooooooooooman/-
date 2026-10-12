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
    { threshold: 0.15 }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

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

  // 先行予約フォーム
  // 一般公開のサイトでは、登録を Google スプレッドシート（tools/preorder-apps-script.gs）に送る。
  // FORM_ENDPOINT にそのウェブアプリの URL（https://script.google.com/macros/s/…/exec）を入れる。
  // claude.ai で公開したページでは、登録をページのデータベース（preorders/<登録者ID>）に保存する。
  // どちらもない場合（ファイルを直接開いた場合など）は保存先がないため、その旨を表示する。
  const FORM_ENDPOINT = "https://script.google.com/macros/s/AKfycby-asz6BfG1G5TD8yRy1CKEKPwxvqyX13yXmjg2-zLrdzU3Jb9WItvQGVm9kuGMmoW1/exec";
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
        const saved = localStorage.getItem(SENT_KEY);
        if (saved) showDone(JSON.parse(saved));
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
      msg.textContent = EN
        ? `You’re registered for pre-order (${data.email}). We’ll email this address when it launches.`
        : `先行予約に登録済みです（${data.email}）。発売が決まったら、このアドレスにお知らせします。`;
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
    const prefEl = form.querySelector("#pref"), trialEl = form.querySelector("#trial");
    const data = {
      email: email.value.trim(),
      prefecture: prefEl ? prefEl.value.trim() : "",
      lang: EN ? "en" : "ja",
      trial: trialEl ? trialEl.checked : false,
      source: form.id === "hero-form" ? "hero" : "bottom",
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
        // Apps Script は別のドメインなので、事前確認のいらない text/plain で送る（返事は読めない）
        await fetch(s.endpoint, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(data) });
        try { localStorage.setItem(SENT_KEY, JSON.stringify({ email: data.email })); } catch (_) { /* 覚えられなくても登録は済んでいる */ }
        showDone(data);
      } catch (_) {
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

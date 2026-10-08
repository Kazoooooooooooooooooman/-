(() => {
  const layers = document.querySelectorAll(".bg-layer");
  const panels = document.querySelectorAll(".panel[data-bg]");
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
    home: `<ul class="home-list"><li>連絡する</li><li>出かける</li><li>お金を管理する</li><li>記録する</li><li>休日を楽しむ</li></ul><div class="small" style="margin-top:14px">次の離れる時間 19:00</div>`,
    contact: `<div class="small">連絡する</div><ul style="font-size:17px;margin-top:6px"><li>電話</li><li>メッセージ</li><li>メール</li></ul><div class="small" style="margin-top:12px">未読の数は表示しません</div>`,
    go: `<div class="small">出かける</div><div class="mid" style="margin:6px 0">次の角を<br>左へ 120m</div><div class="small">乗換 ・ 支払い ・ 天気</div>`,
    money: `<div class="small">お金を管理する</div><div class="mid" style="margin:6px 0 4px">今月のカード請求</div><div class="big" style="font-size:34px">¥48,210</div><div class="small" style="margin-top:10px">確認できたら、閉じるだけ</div>`,
    record: `<div class="photo" role="img" aria-label="カメラで撮ったカラー写真"></div><div class="small">写真だけは、カラーで。</div>`,
    holiday: `<div class="small">今度の休日にしたいこと</div><div class="mid" style="margin:6px 0 12px">日帰り温泉</div><div class="bar"><span style="width:62%"></span></div><div class="small" style="margin-top:8px">あと 4 回の離れる時間で割引</div>`,
    away: `<div class="small">離れる時間</div><div class="mid" style="margin:6px 0">夕食 19:00–20:00</div><div class="small">届くのは家族と緊急の連絡だけ<br>地図と支払いは使えます</div><div class="pill">あと 5 分だけ使う</div>`,
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

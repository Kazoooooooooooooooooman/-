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
    let idx = 0;
    panels.forEach((p) => {
      if (p.getBoundingClientRect().top <= mid) idx = Number(p.dataset.bg);
    });
    setScene(idx);
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

  // 予約フォーム（送信先はまだないので画面上で受付メッセージを表示）
  const form = document.getElementById("reserve-form");
  const msg = document.getElementById("form-msg");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = form.querySelector("input");
    if (!email.checkValidity()) {
      msg.textContent = "メールアドレスを確認してください。";
      return;
    }
    msg.textContent = "ありがとうございます。準備が整いしだい、静かにお知らせします。";
    form.reset();
  });
})();

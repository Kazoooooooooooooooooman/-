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
    const url = l.style.backgroundImage.slice(5, -2);
    new Image().src = url;
  });

  // 端末の画面：道具を選ぶと表示が変わる
  const screens = {
    phone: `<div class="mid">母</div><div class="small">発信中…</div><ul style="margin-top:18px;font-size:15px"><li>ハル</li><li>ソラ</li><li>事務所</li></ul>`,
    message: `<div class="small">ハル</div><div class="mid" style="margin:6px 0 14px">今夜、月が<br>きれいだよ。</div><div class="small">返信：見てる。</div>`,
    map: `<div class="small">次の角を</div><div class="mid">左へ 120m</div><div class="small" style="margin-top:14px">竹林の小径</div>`,
    alarm: `<div class="big">6:30</div><div class="small">鳥のさえずり ・ 毎日</div>`,
    steps: `<div class="small">今日の歩数</div><div class="big">8,012</div><div class="small" style="margin-top:12px">特典が届きました<br>喫茶 こもれび ・ コーヒー1杯</div>`,
    camera: `<div class="photo" role="img" aria-label="カメラで撮ったカラー写真"></div><div class="small">写真だけは、カラーで。</div>`,
    home: `<ul><li>電話</li><li>メッセージ</li><li>地図</li><li>アラーム</li><li>歩数</li><li>カメラ</li></ul>`,
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

// アクセス解析（Google Analytics と Microsoft Clarity）を読み込み、Cookie を使うのは同意をもらってからにする。
// ・同意する前：Cookie は使わない。Google Analytics は Cookie なしの簡単な記録だけ、Clarity も Cookie なしで動く
//   （Clarity の管理画面で「Cookies」をオフにしておくと、同意の合図が来るまで Cookie を使わない）
// ・同意したら：Cookie を使って、同じ人の再訪や、ページのどこで止まったか・どこを押したかを記録する
// ・選んだ結果はこのブラウザの localStorage「soto-consent」に覚える（"granted" か "denied"）
// ・プライバシーポリシーの data-consent="reset" のボタンで、選び直せる
(function () {
  var GA_ID = "G-BKQMGZTR46";
  var CLARITY_ID = "z6p780jwuo"; // Microsoft Clarity のプロジェクト ID。入れると Clarity も読み込む
  var KEY = "soto-consent";
  var choice = null;
  try { choice = localStorage.getItem(KEY); } catch (_) { /* 読めなければ、まだ選んでいない扱い */ }
  var en = (document.documentElement.lang || "").indexOf("en") === 0;

  // Google Analytics（同意モード：最初は Cookie を使わない）
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("consent", "default", {
    ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
    analytics_storage: choice === "granted" ? "granted" : "denied"
  });
  gtag("js", new Date());
  gtag("config", GA_ID);
  var ga = document.createElement("script");
  ga.async = true;
  ga.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
  document.head.appendChild(ga);

  // Microsoft Clarity（ヒートマップと、操作の録画）
  if (CLARITY_ID) {
    window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    var cl = document.createElement("script");
    cl.async = true;
    cl.src = "https://www.clarity.ms/tag/" + CLARITY_ID;
    document.head.appendChild(cl);
    if (choice === "granted") window.clarity("consent");
  }

  function grant() {
    gtag("consent", "update", { analytics_storage: "granted" });
    if (CLARITY_ID) window.clarity("consent");
  }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (_) { /* 覚えられなくても、この画面では反映する */ } }

  function banner() {
    if (document.getElementById("soto-consent")) return;
    var box = document.createElement("div");
    box.id = "soto-consent";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", en ? "Cookies" : "Cookie について");
    box.innerHTML = en
      ? '<p>May we use cookies to see how people read this site (how far they scroll, what they tap)? We don’t record names or email addresses. <a href="/privacy-en#cookies">Details</a></p><div><button type="button" data-v="granted">Allow</button><button type="button" data-v="denied">No thanks</button></div>'
      : '<p>サイトを見やすく直すため、Cookie で「どこまで読まれたか・どこが押されたか」を記録してもよいですか？名前やメールアドレスは記録しません。<a href="/privacy#cookies">詳しく</a></p><div><button type="button" data-v="granted">同意する</button><button type="button" data-v="denied">同意しない</button></div>';
    var css = document.createElement("style");
    css.textContent = "#soto-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:60;max-width:420px;margin:0 auto;padding:14px 16px;border-radius:14px;background:#fff;color:#1f1e1c;box-shadow:0 10px 30px -10px rgba(31,30,28,.35);border:1px solid rgba(31,30,28,.14);font-size:13px;line-height:1.6}"
      + "#soto-consent p{margin:0 0 10px}#soto-consent a{color:inherit}"
      + "#soto-consent div{display:flex;gap:8px}#soto-consent button{flex:1;padding:9px 10px;border-radius:999px;border:1px solid #1f1e1c;background:#fff;color:#1f1e1c;font:inherit;font-weight:600;cursor:pointer}"
      + "#soto-consent button[data-v=granted]{background:#1f1e1c;color:#fff}"
      + "@media (min-width:821px){#soto-consent{left:24px;right:auto;bottom:24px;margin:0}}";
    document.head.appendChild(css);
    box.addEventListener("click", function (e) {
      var v = e.target && e.target.getAttribute && e.target.getAttribute("data-v");
      if (!v) return;
      save(v);
      if (v === "granted") grant();
      else gtag("consent", "update", { analytics_storage: "denied" });
      box.remove();
    });
    document.body.appendChild(box);
  }

  // まだ選んでいない人にだけ、最初の画面を見終わったころ（少しスクロールしたか、8秒たったら）出す
  function later() {
    if (choice) return;
    var shown = false;
    var show = function () { if (shown) return; shown = true; removeEventListener("scroll", onScroll); banner(); };
    var onScroll = function () { if (scrollY > innerHeight * 0.5) show(); };
    addEventListener("scroll", onScroll, { passive: true });
    setTimeout(show, 8000);
  }

  function ready() {
    later();
    // プライバシーポリシーの「選び直す」ボタン
    document.querySelectorAll('[data-consent="reset"]').forEach(function (b) {
      b.addEventListener("click", function () {
        try { localStorage.removeItem(KEY); } catch (_) { /* 消せなくても下で出し直す */ }
        choice = null;
        banner();
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
})();

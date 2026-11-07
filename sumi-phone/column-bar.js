// コラムの記事で、3割ほど読み進めたら、画面の下に先行登録の帯を小さく出す。
// ・×で閉じた人と、もう登録した人には出さない
// ・記事の中の登録ボタンや、最後の案内が画面に見えている間は隠す
// ・Cookie の確認が出ている間は、重ならないように隠す
(() => {
  const bar = document.getElementById("col-bar");
  if (!bar) return;
  const get = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* 保存できなくても動く */ } };
  if (get("soto-colbar-closed") || get("soto-preorder")) return;

  let visibleCtas = 0, ready = false;
  const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => {
    es.forEach((e) => { visibleCtas += e.isIntersecting ? 1 : (e.target._seen ? -1 : 0); e.target._seen = e.isIntersecting; });
    update();
  }) : null;
  if (io) document.querySelectorAll(".inline-cta, .article-cta").forEach((el) => io.observe(el));

  function update() {
    const max = document.documentElement.scrollHeight - innerHeight;
    if (!ready && max > 0 && scrollY / max >= 0.3) ready = true;
    const show = ready && visibleCtas <= 0 && !document.getElementById("soto-consent");
    bar.classList.toggle("is-on", show);
    bar.setAttribute("aria-hidden", show ? "false" : "true");
    bar.querySelectorAll("a,button").forEach((el) => { el.tabIndex = show ? 0 : -1; });
  }
  bar.hidden = false;
  update();
  addEventListener("scroll", update, { passive: true });
  addEventListener("resize", update);
  setInterval(update, 1500); // Cookie の確認が閉じたあとに出すため
  bar.querySelector(".col-bar-x").addEventListener("click", () => {
    set("soto-colbar-closed", "1");
    bar.remove();
  });
})();

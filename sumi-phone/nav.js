// ナビ：狭い画面のメニューの開け閉めと、トップページで今いる場所に下線を引く
(() => {
  const nav = document.querySelector(".nav");
  const btn = nav && nav.querySelector(".nav-toggle");
  if (!nav || !btn) return;
  const openLabel = btn.getAttribute("aria-label");
  const setH = () => document.documentElement.style.setProperty("--nav-h", nav.offsetHeight + "px");
  const setOpen = (open) => {
    setH();
    nav.classList.toggle("is-open", open);
    document.body.classList.toggle("menu-open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", open ? btn.dataset.close : openLabel);
  };
  btn.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
  nav.querySelectorAll(".nav-links a, .nav-cta").forEach((a) => a.addEventListener("click", () => setOpen(false)));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && nav.classList.contains("is-open")) { setOpen(false); btn.focus(); } });
  window.matchMedia("(min-width: 821px)").addEventListener("change", (e) => { if (e.matches) setOpen(false); });

  // トップページ：画面の上から4割の位置にある節に対応するリンクに下線を引く
  const links = [...nav.querySelectorAll('.nav-links a[href^="#"]')];
  const secs = links.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  if (!secs.length) return;
  let ticking = false;
  const spy = () => {
    ticking = false;
    const y = window.innerHeight * 0.4;
    let cur = null;
    secs.forEach((s) => { if (s.getBoundingClientRect().top <= y) cur = s; });
    const signup = document.getElementById("signup");
    if (signup && signup.getBoundingClientRect().top <= y) cur = null;
    links.forEach((a) => a.classList.toggle("is-current", !!cur && a.getAttribute("href") === "#" + cur.id));
  };
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }, { passive: true });
  spy();
})();

/* feather — Video Audio Captioning (faithful UI mock of the micro1 task screen) */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const DURATION = 14.38;          // total seconds (matches 00:14.38)
  let pxPerSec = 1100;             // timeline zoom (deciseconds spacing)
  let t = 0, playing = false, rate = 1, last = 0;

  const fmt = (sec, dec = 2) => {
    const m = Math.floor(sec / 60), s = sec - m * 60;
    return `${String(m).padStart(2, "0")}:${s.toFixed(dec).padStart(dec ? 3 + dec : 2, "0")}`;
  };

  // ---------- waveform strip ----------
  const wc = $("#wavecanvas"), wctx = wc.getContext("2d");
  function drawWave() {
    const w = Math.round((DURATION - 6.3) * 90); // partial strip like screenshot
    wc.width = w * devicePixelRatio; wc.height = 42 * devicePixelRatio;
    wc.style.width = w + "px";
    wctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    wctx.clearRect(0, 0, w, 42);
    let x = 99; const rnd = () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let env = .2;
    for (let i = 0; i < w; i += 2) {
      env += (rnd() - env) * .3;
      const a = Math.max(1, env * 18);
      wctx.fillStyle = "#9ca3af";
      wctx.fillRect(i, 21 - a, 1.4, a * 2);
    }
  }

  // ---------- timeline ----------
  const DIA = [
    { s: 0.0, e: 3.6, text: "unintelligible speech" },
    { s: 3.6, e: 4.1, text: "よー。" },
    { s: 4.1, e: 9.2, text: "unintelligible speech" },
  ];
  const CAP = [
    { s: 0.0, e: 14.38, text: "Loud off-screen pop music, heavy bass, epic mood." },
    { s: 0.0, e: 14.38, text: "Continuous high-frequency electric buzzing throughout." },
  ];
  function buildTimeline() {
    const W = DURATION * pxPerSec;
    $("#tl-inner").style.width = W + "px";
    // ruler at 0.1s steps
    const ruler = $("#tl-ruler"); ruler.innerHTML = "";
    for (let d = 0; d <= DURATION * 10; d++) {
      const sec = d / 10;
      const tick = document.createElement("div");
      tick.className = "tick"; tick.style.left = (sec * pxPerSec) + "px";
      tick.textContent = (d % 10 === 0) ? fmt(sec, 0) : fmt(sec, 1);
      ruler.appendChild(tick);
    }
    // diarization lane
    const ld = $("#lane-dia"); ld.innerHTML = "";
    DIA.forEach((b) => {
      const el = document.createElement("div");
      el.className = "tl-block";
      el.style.left = (b.s * pxPerSec) + "px";
      el.style.width = ((b.e - b.s) * pxPerSec - 3) + "px";
      el.textContent = b.text;
      el.onclick = () => { t = b.s; sync(); };
      ld.appendChild(el);
    });
    // captions lane
    const lc = $("#lane-cap"); lc.innerHTML = "";
    CAP.forEach((b, i) => {
      const el = document.createElement("div");
      el.className = "tl-cap";
      el.style.left = (b.s * pxPerSec) + "px";
      el.style.top = (4 + i * 1) + "px"; // slight stagger handled by lane height; keep simple
      el.style.width = ((b.e - b.s) * pxPerSec - 4) + "px";
      el.textContent = b.text;
      lc.appendChild(el);
    });
  }

  // ---------- playback ----------
  function sync() {
    $("#seek").value = Math.round(t * 100);
    $("#tc").textContent = `${fmt(t)} / 00:14.38`;
    $("#wave-head").style.left = `calc(42% + ${t * 90}px)`;
  }
  function loop(ts) {
    if (playing) {
      if (!last) last = ts;
      t += ((ts - last) / 1000) * rate; last = ts;
      if (t >= DURATION) { t = DURATION; toggle(false); }
      sync();
    } else last = 0;
    requestAnimationFrame(loop);
  }
  function toggle(f) { playing = f === undefined ? !playing : f; $("#play").textContent = playing ? "Pause" : "Play"; last = 0; }

  // ---------- tabs ----------
  $$(".tab").forEach((tab) => tab.onclick = () => {
    $$(".tab").forEach((x) => x.classList.toggle("active", x === tab));
    $$("[data-panel]").forEach((p) => p.hidden = p.dataset.panel !== tab.dataset.tab);
  });
  $$(".subtab").forEach((tab) => tab.onclick = () => {
    $$(".subtab").forEach((x) => x.classList.toggle("active", x === tab));
    $$("[data-subpanel]").forEach((p) => p.hidden = p.dataset.subpanel !== tab.dataset.sub);
  });

  // ---------- yes/no ----------
  $$("[data-yn] button").forEach((b) => b.onclick = () => {
    b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  });

  // ---------- misc controls ----------
  const toast = (m) => { const el = $("#toast"); el.textContent = m; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 1400); };
  $("#play").onclick = () => toggle();
  $("#seek").oninput = (e) => { t = e.target.value / 100; sync(); };
  $("#speed").onchange = (e) => { rate = parseFloat(e.target.value); };
  $("#fs").onclick = () => { const p = document.querySelector(".player"); (p.requestFullscreen ? p.requestFullscreen() : toast("フルスクリーン")); };
  $("#zoom-in").onclick = () => { pxPerSec = Math.min(2600, pxPerSec * 1.4); buildTimeline(); };
  $("#zoom-out").onclick = () => { pxPerSec = Math.max(300, pxPerSec / 1.4); buildTimeline(); };
  $("#copy-id").onclick = async () => { try { await navigator.clipboard.writeText("5098858366000774098"); toast("Task ID をコピーしました"); } catch { toast("5098858366000774098"); } };
  $$(".dia-chip").forEach((c) => c.onclick = () => toast("チップを選択: " + c.textContent));
  window.addEventListener("keydown", (e) => { if (e.code === "Space" && !e.target.matches("input,textarea,select")) { e.preventDefault(); toggle(); } });

  drawWave(); buildTimeline(); sync();
  window.addEventListener("resize", drawWave);
  requestAnimationFrame(loop);
})();

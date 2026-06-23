/* feather — audio annotation dashboard (standalone prototype) */
(() => {
  "use strict";

  // ---------- option vocabularies (the labeling taxonomy) ----------
  const SPEAKERS = ["Agent", "Customer", "Speaker C", "Overlap", "Silence/Noise"];
  const EMOTIONS = ["neutral", "happy", "angry", "sad", "anxious", "frustrated", "excited", "confused"];
  const VOCALS   = ["calm", "fast", "hesitant", "emphatic", "monotone", "whisper", "raised voice", "laughing"];

  // ---------- task queue (fake dataset, как from a client) ----------
  const TASKS = [
    { id: "task_0481", file: "call_audio.wav", dur: 42.5, status: "todo",   seed: 7 },
    { id: "task_0482", file: "support_03.wav", dur: 31.0, status: "review", seed: 21 },
    { id: "task_0483", file: "interview_a.wav", dur: 58.2, status: "done",  seed: 4 },
    { id: "task_0484", file: "sales_demo.wav", dur: 27.8, status: "todo",   seed: 55 },
  ];

  // ---------- state ----------
  let task = TASKS[0];
  let duration = task.dur;
  let segments = [];          // {id,start,end,speaker,transcript,emotion,intensity,vocal,vnotes}
  let selectedId = null;
  let playing = false;
  let playT = 0;              // seconds
  let rate = 1;
  let lastTick = 0;
  let waveData = [];

  const $ = (s) => document.querySelector(s);
  const fmt = (t) => {
    const m = Math.floor(t / 60), s = (t % 60);
    return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
  };
  const uid = () => "s" + Math.random().toString(36).slice(2, 8);

  // ---------- synthetic waveform (seeded, deterministic) ----------
  function genWave(seed, n = 1400) {
    let x = seed * 9973 + 1;
    const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
    const out = [];
    let env = 0;
    for (let i = 0; i < n; i++) {
      // speech-like: bursts of energy with gaps
      const phrase = Math.sin(i / 70) * 0.5 + 0.5;
      const gap = phrase < 0.25 ? 0.05 : 1;
      env += ((rnd() * gap) - env) * 0.25;
      const a = Math.max(0.02, env * (0.4 + rnd() * 0.6));
      out.push(a);
    }
    return out;
  }

  // ---------- canvas waveform ----------
  const canvas = $("#wave");
  const ctx = canvas.getContext("2d");
  function drawWave() {
    const w = canvas.clientWidth, h = canvas.height;
    canvas.width = w * devicePixelRatio; canvas.height = h * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const mid = h / 2, n = waveData.length, bw = w / n;
    const css = getComputedStyle(document.body);
    const brand = css.getPropertyValue("--brand").trim() || "#4f46e5";
    for (let i = 0; i < n; i++) {
      const a = waveData[i] * (h * 0.46);
      const played = (i / n) * duration <= playT;
      ctx.fillStyle = played ? brand : "#cbd5e1";
      ctx.fillRect(i * bw, mid - a, Math.max(1, bw * 0.7), a * 2);
    }
  }

  // ---------- time axis ----------
  function drawAxis() {
    const ax = $("#timeaxis"); ax.innerHTML = "";
    const ticks = 6;
    for (let i = 0; i <= ticks; i++) {
      const t = (duration / ticks) * i;
      const s = document.createElement("span");
      s.style.left = (i / ticks * 100) + "%";
      s.textContent = fmt(t);
      ax.appendChild(s);
    }
  }

  // ---------- regions overlay ----------
  function renderRegions() {
    const box = $("#regions"); box.innerHTML = "";
    const w = box.clientWidth;
    segments.forEach((seg, i) => {
      const el = document.createElement("div");
      el.className = "region" + (seg.id === selectedId ? " sel" : "");
      el.style.left = (seg.start / duration * w) + "px";
      el.style.width = ((seg.end - seg.start) / duration * w) + "px";
      el.innerHTML = `<span class="rlabel">#${i + 1} ${seg.speaker || "?"}</span>` +
        (seg.emotion ? `<span class="emo">${emoIcon(seg.emotion)}</span>` : "");
      el.onclick = (e) => { e.stopPropagation(); select(seg.id); };
      box.appendChild(el);
    });
  }
  const emoIcon = (e) => ({neutral:"😐",happy:"😊",angry:"😠",sad:"😢",anxious:"😰",frustrated:"😤",excited:"🤩",confused:"😕"}[e] || "");

  // ---------- segment list ----------
  function renderSegList() {
    const list = $("#seg-list"); $("#seg-count").textContent = segments.length;
    if (!segments.length) { list.innerHTML = `<div class="empty">区間がありません。波形をドラッグして作成してください。</div>`; return; }
    list.innerHTML = "";
    segments.sort((a, b) => a.start - b.start).forEach((seg, i) => {
      const row = document.createElement("div");
      row.className = "seg-row" + (seg.id === selectedId ? " sel" : "");
      const tags = [];
      if (seg.speaker) tags.push(`<span class="tag spk">${seg.speaker}</span>`);
      if (seg.emotion) tags.push(`<span class="tag emo">${emoIcon(seg.emotion)} ${seg.emotion}</span>`);
      if (seg.vocal) tags.push(`<span class="tag voc">${seg.vocal}</span>`);
      row.innerHTML = `<span class="seg-idx">${i + 1}</span>
        <span class="seg-time">${fmt(seg.start)} → ${fmt(seg.end)}</span>
        <span class="seg-tags">${tags.join("") || '<span class="tag">未ラベル</span>'}</span>
        <span class="seg-del" title="削除">✕</span>`;
      row.onclick = () => select(seg.id);
      row.querySelector(".seg-del").onclick = (e) => { e.stopPropagation(); del(seg.id); };
      list.appendChild(row);
    });
  }

  // ---------- option grids ----------
  function buildOpts(elId, vals, key) {
    const box = $(elId); box.innerHTML = "";
    vals.forEach((v) => {
      const b = document.createElement("button");
      b.className = "opt"; b.textContent = v; b.dataset.val = v;
      b.onclick = () => setField(key, v);
      box.appendChild(b);
    });
  }

  function syncOpts() {
    const seg = current();
    [["#opt-speakers", "speaker"], ["#opt-emotion", "emotion"], ["#opt-vocal", "vocal"]].forEach(([sel, key]) => {
      document.querySelectorAll(sel + " .opt").forEach((b) =>
        b.classList.toggle("sel", seg && seg[key] === b.dataset.val));
    });
    $("#transcript").value = seg?.transcript || "";
    $("#vocal-notes").value = seg?.vnotes || "";
    $("#intensity").value = seg?.intensity || 3;
    $("#intensity-val").textContent = seg?.intensity || 3;
    $("#active-seg-label").textContent = seg
      ? `区間 #${segments.indexOf(seg) + 1} · ${fmt(seg.start)} → ${fmt(seg.end)}`
      : "区間を選択してください";
  }

  // ---------- mutations ----------
  const current = () => segments.find((s) => s.id === selectedId);
  function setField(key, val) {
    const seg = current(); if (!seg) { flashHint(); return; }
    seg[key] = (seg[key] === val) ? "" : val; // toggle off if re-click
    refresh(); autosave();
  }
  function bindInputs() {
    $("#transcript").oninput = (e) => { const s = current(); if (s) { s.transcript = e.target.value; updateJson(); autosave(); } };
    $("#vocal-notes").oninput = (e) => { const s = current(); if (s) { s.vnotes = e.target.value; updateJson(); autosave(); } };
    $("#intensity").oninput = (e) => { $("#intensity-val").textContent = e.target.value; const s = current(); if (s) { s.intensity = +e.target.value; updateJson(); autosave(); } };
  }
  function select(id) { selectedId = id; refresh(); }
  function del(id) {
    segments = segments.filter((s) => s.id !== id);
    if (selectedId === id) selectedId = segments[0]?.id || null;
    refresh(); autosave();
  }
  function addSegment(start, end) {
    start = Math.max(0, Math.min(start, duration));
    end = Math.max(0, Math.min(end, duration));
    if (Math.abs(end - start) < 0.3) return; // too small
    if (end < start) [start, end] = [end, start];
    const seg = { id: uid(), start, end, speaker: "", transcript: "", emotion: "", intensity: 3, vocal: "", vnotes: "" };
    segments.push(seg); selectedId = seg.id; refresh(); autosave();
  }

  let saveTimer;
  function autosave() {
    const el = $("#autosave"); el.classList.add("show");
    clearTimeout(saveTimer); saveTimer = setTimeout(() => el.classList.remove("show"), 900);
  }
  function flashHint() {
    const h = $("#active-seg-label"); h.style.color = "var(--rose)";
    h.textContent = "先に区間を選択してください"; setTimeout(() => { h.style.color = ""; syncOpts(); }, 1000);
  }

  // ---------- delivery JSON ----------
  function buildPayload() {
    return {
      task_id: task.id, audio_file: task.file, duration_sec: +duration.toFixed(2),
      sample_rate: 16000, channels: 1, annotator: "u_demo",
      schema_version: "1.0",
      segments: segments.slice().sort((a, b) => a.start - b.start).map((s, i) => ({
        index: i + 1, start: +s.start.toFixed(2), end: +s.end.toFixed(2),
        speaker: s.speaker || null, transcript: s.transcript || null,
        emotion: s.emotion || null, emotion_intensity: s.emotion ? s.intensity : null,
        vocal_delivery: s.vocal || null, notes: s.vnotes || null,
      })),
    };
  }
  function updateJson() {
    const json = JSON.stringify(buildPayload(), null, 2)
      .replace(/("(\\.|[^"])*?")(\s*:)/g, '<span class="k">$1</span>$3')
      .replace(/:\s*("(\\.|[^"])*?")/g, ': <span class="s">$1</span>')
      .replace(/:\s*(-?\d+\.?\d*)/g, ': <span class="n">$1</span>');
    $("#json-out").innerHTML = json;
  }

  // ---------- master refresh ----------
  function refresh() { renderRegions(); renderSegList(); syncOpts(); updateJson(); drawWave(); }

  // ---------- playback loop ----------
  function loop(ts) {
    if (playing) {
      if (!lastTick) lastTick = ts;
      playT += ((ts - lastTick) / 1000) * rate;
      lastTick = ts;
      if (playT >= duration) { playT = duration; togglePlay(false); }
      updatePlayhead(); drawWave();
    } else lastTick = 0;
    requestAnimationFrame(loop);
  }
  function updatePlayhead() {
    const wrap = $("#regions"); const w = wrap.clientWidth;
    $("#playhead").style.left = (14 + playT / duration * w) + "px";
    $("#audio-meta").textContent = `${task.file} · ${fmt(playT)} / ${fmt(duration)} · 16kHz mono`;
  }
  function togglePlay(force) {
    playing = force === undefined ? !playing : force;
    $("#btn-play").textContent = playing ? "⏸" : "▶";
    lastTick = 0;
  }

  // ---------- drag to create region ----------
  function setupDrag() {
    const wrap = $("#regions"); let dragging = false, x0 = 0, ghost = null;
    const toSec = (clientX) => {
      const r = wrap.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
    };
    wrap.parentElement.addEventListener("mousedown", (e) => {
      if (e.target.closest(".region")) return;
      dragging = true; x0 = toSec(e.clientX);
      ghost = document.createElement("div"); ghost.className = "region sel";
      ghost.style.left = (x0 / duration * wrap.clientWidth) + "px"; ghost.style.width = "0px";
      wrap.appendChild(ghost);
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const x1 = toSec(e.clientX), a = Math.min(x0, x1), b = Math.max(x0, x1);
      ghost.style.left = (a / duration * wrap.clientWidth) + "px";
      ghost.style.width = ((b - a) / duration * wrap.clientWidth) + "px";
    });
    window.addEventListener("mouseup", (e) => {
      if (!dragging) return; dragging = false;
      const x1 = toSec(e.clientX); ghost?.remove();
      addSegment(x0, x1);
    });
    // click on waveform (not drag) -> move playhead
    wrap.parentElement.addEventListener("click", (e) => {
      if (e.target.closest(".region")) return;
      // tiny movement counts as seek handled via mouseup small region rejected
    });
  }

  // ---------- tabs ----------
  function setupTabs() {
    document.querySelectorAll(".tab").forEach((t) => t.onclick = () => activateTab(t.dataset.tab));
  }
  function activateTab(name) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tabpanel").forEach((p) => {
      const on = p.dataset.panel === name;
      p.hidden = !on; p.dataset.state = on ? "active" : "inactive";
    });
  }

  // ---------- task queue ----------
  function renderQueue() {
    const q = $("#queue"); q.innerHTML = "";
    TASKS.forEach((t) => {
      const el = document.createElement("div");
      el.className = "q-item" + (t.id === task.id ? " active" : "");
      el.innerHTML = `<div class="q-title">${t.file}</div>
        <div class="q-meta"><span>${t.id}</span>·<span>${fmt(t.dur)}</span>
        <span class="q-badge ${t.status}">${t.status}</span></div>`;
      el.onclick = () => loadTask(t);
      q.appendChild(el);
    });
  }
  function loadTask(t) {
    task = t; duration = t.dur; segments = []; selectedId = null; playT = 0; togglePlay(false);
    waveData = genWave(t.seed);
    $("#crumb").textContent = `— / ${t.id} / ${t.file}`;
    // seed a couple of example segments on the first task so it looks alive
    if (t.id === "task_0481") {
      segments = [
        { id: uid(), start: 1.2, end: 6.8, speaker: "Agent", transcript: "お電話ありがとうございます。", emotion: "neutral", intensity: 2, vocal: "calm", vnotes: "" },
        { id: uid(), start: 8.1, end: 14.3, speaker: "Customer", transcript: "先週注文した商品がまだ届いていません。", emotion: "frustrated", intensity: 4, vocal: "fast", vnotes: "語尾が強い" },
      ];
      selectedId = segments[0].id;
    }
    renderQueue(); drawAxis(); updatePlayhead(); refresh();
  }

  // ---------- shortcuts ----------
  function setupKeys() {
    window.addEventListener("keydown", (e) => {
      if (e.target.matches("textarea,input")) return;
      const idx = segments.findIndex((s) => s.id === selectedId);
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.key === "e" || e.key === "E") { addSegment(playT, playT + 3); }
      else if (e.key === "Delete" || e.key === "Backspace") { if (selectedId) del(selectedId); }
      else if (e.key === "ArrowRight") { if (idx < segments.length - 1) select(segments[idx + 1].id); }
      else if (e.key === "ArrowLeft") { if (idx > 0) select(segments[idx - 1].id); }
      else if (e.key === "1") activateTab("speakers");
      else if (e.key === "2") activateTab("emotion");
      else if (e.key === "3") activateTab("vocal_delivery");
    });
  }

  // ---------- resize handle ----------
  function setupResize() {
    const h = document.querySelector('[data-handle="left"]'); const left = $("#left-panel");
    let drag = false;
    h.addEventListener("mousedown", () => { drag = true; h.classList.add("drag"); document.body.style.cursor = "col-resize"; });
    window.addEventListener("mousemove", (e) => { if (drag) left.style.flexBasis = Math.max(160, Math.min(420, e.clientX)) + "px"; });
    window.addEventListener("mouseup", () => { drag = false; h.classList.remove("drag"); document.body.style.cursor = ""; });
  }

  // ---------- buttons ----------
  function setupButtons() {
    $("#btn-play").onclick = () => togglePlay();
    $("#btn-fwd").onclick = () => { playT = Math.min(duration, playT + 5); updatePlayhead(); drawWave(); };
    $("#btn-back").onclick = () => { playT = Math.max(0, playT - 5); updatePlayhead(); drawWave(); };
    document.querySelectorAll(".chip[data-rate]").forEach((c) => c.onclick = () => {
      rate = +c.dataset.rate; document.querySelectorAll(".chip").forEach((x) => x.classList.remove("active")); c.classList.add("active");
    });
    $("#btn-clear").onclick = () => { if (confirm("全区間を削除しますか？")) { segments = []; selectedId = null; refresh(); } };
    $("#btn-prev").onclick = () => { const i = segments.findIndex((s) => s.id === selectedId); if (i > 0) select(segments[i - 1].id); };
    $("#btn-next").onclick = () => { const i = segments.findIndex((s) => s.id === selectedId); if (i < segments.length - 1) select(segments[i + 1].id); };
    $("#btn-copy").onclick = async () => {
      await navigator.clipboard.writeText(JSON.stringify(buildPayload(), null, 2));
      const b = $("#btn-copy"); b.textContent = "コピー済 ✓"; setTimeout(() => b.textContent = "コピー", 1200);
    };
    $("#btn-submit").onclick = () => {
      const labeled = segments.filter((s) => s.speaker && s.emotion).length;
      alert(`納品プレビュー\n\nタスク: ${task.id}\n区間数: ${segments.length}\n完全ラベル済: ${labeled}\n\n実運用ではここで POST /deliveries が叩かれ、\n相手企業の Webhook に納品完了が通知されます。`);
    };
    $("#btn-shortcuts").onclick = () => $("#modal").hidden = false;
    $("#modal-close").onclick = () => $("#modal").hidden = true;
    $("#modal").onclick = (e) => { if (e.target.id === "modal") $("#modal").hidden = true; };
  }

  // ---------- init ----------
  function init() {
    buildOpts("#opt-speakers", SPEAKERS, "speaker");
    buildOpts("#opt-emotion", EMOTIONS, "emotion");
    buildOpts("#opt-vocal", VOCALS, "vocal");
    bindInputs(); setupTabs(); setupDrag(); setupKeys(); setupResize(); setupButtons();
    renderQueue(); loadTask(TASKS[0]);
    window.addEventListener("resize", () => { drawWave(); renderRegions(); drawAxis(); updatePlayhead(); });
    requestAnimationFrame(loop);
  }
  document.addEventListener("DOMContentLoaded", init);
})();

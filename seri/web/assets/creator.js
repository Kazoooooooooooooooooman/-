import { api, $, show, el, yen, requireUser, logout, statusLabel, pill } from "/assets/api.js";
import { toWav } from "/assets/wav.js";

const me = await requireUser(["creator"]);
if (me) {
  $("#who").textContent = me.name + (me.industry ? `（${me.industry_verified ? "確認済み" : "確認待ち"}）` : "");
  $("#logout").onclick = logout;
  const meta = await api("/api/meta");
  const msg = $("#msg");
  let current = null, recorder = null, chunks = [], started = 0, tick = null, stream = null, result = null, raf = null;

  async function loadAll() {
    const [tasks, subs, earn] = await Promise.all([api("/api/tasks"), api("/api/submissions/mine"), api("/api/earnings")]);
    $("#available").textContent = yen(earn.available_jpy);
    $("#held").textContent = yen(earn.held_jpy);
    $("#tasks").replaceChildren(...(tasks.length ? tasks.map((t) => el("div", { class: "card task" },
      el("div", { class: "row" }, pill([t.category_label, ""]), t.tier !== "any" ? pill([t.tier_label, "good"]) : "", t.industry ? pill([t.industry_label, "wait"]) : ""),
      el("p", {}, t.instructions || "自由に話してください"),
      el("p", { class: "big" }, yen(t.you_earn_jpy)),
      el("p", { class: "muted" }, `1件あたりのあなたの取り分 · あと${t.your_remaining}件まで`),
      el("button", { type: "button", class: "accent", onclick: () => openRecorder(t) }, "録音する"),
    )) : [el("p", { class: "muted" }, "今は受けられる仕事がありません。新しい注文が入るとここに表示されます。")]));
    $("#subs").replaceChildren(...(subs.length ? subs.map((s) => el("tr", {},
      el("td", {}, s.id), el("td", {}, "#" + s.order_id), el("td", { class: "num" }, s.duration_sec ? s.duration_sec + " 秒" : "—"),
      el("td", {}, pill(statusLabel[s.status] || [s.status])), el("td", {}, s.reason || ""),
    )) : [el("tr", {}, el("td", { colspan: 5, class: "muted" }, "まだ提出はありません"))]));
    $("#sales").replaceChildren(...(earn.sales.length ? earn.sales.map((s) => el("tr", {},
      el("td", {}, s.buyer), el("td", {}, s.category), el("td", {}, s.license), el("td", { class: "num" }, yen(s.price_jpy)), el("td", { class: "num" }, yen(s.you_jpy)),
    )) : [el("tr", {}, el("td", { colspan: 5, class: "muted" }, "まだ売れたデータはありません"))]));
  }

  function openRecorder(t) {
    current = t; result = null;
    const cat = meta.categories[t.category];
    $("#rec-title").textContent = `${t.category_label} · ${yen(t.you_earn_jpy)}`;
    $("#rec-instructions").textContent = t.instructions || "自由に話してください";
    $("#rec-rules").textContent = `${cat.min_sec}〜${cat.max_sec}秒。静かな場所で、スマホを口から20cmほど離して話してください。`;
    $("#preview").hidden = true; $("#submit").disabled = true; show($("#rec-check"), "");
    $("#recorder").hidden = false;
    $("#recorder").scrollIntoView({ behavior: "smooth" });
  }

  async function start() {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { return show($("#rec-check"), "マイクを使えません。ブラウザの設定でマイクを許可してください。", false); }
    const ctx = new AudioContext(), an = ctx.createAnalyser();
    ctx.createMediaStreamSource(stream).connect(an);
    const data = new Uint8Array(an.fftSize);
    const draw = () => { an.getByteTimeDomainData(data); let peak = 0; for (const d of data) peak = Math.max(peak, Math.abs(d - 128)); $("#level").style.width = Math.min(100, peak / 1.28) + "%"; raf = requestAnimationFrame(draw); };
    draw();
    recorder = new MediaRecorder(stream); chunks = [];
    const mime = recorder.mimeType; // stop() clears `recorder` before onstop fires
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = async () => {
      cancelAnimationFrame(raf); ctx.close(); stream.getTracks().forEach((tr) => tr.stop()); $("#level").style.width = "0";
      result = await toWav(new Blob(chunks, { type: mime }));
      $("#preview").src = URL.createObjectURL(result.wav); $("#preview").hidden = false;
      const cat = meta.categories[current.category], problems = [];
      if (result.seconds < cat.min_sec) problems.push(`短すぎます（${result.seconds.toFixed(1)}秒）`);
      if (result.seconds > cat.max_sec) problems.push(`長すぎます（${result.seconds.toFixed(1)}秒）`);
      const lim = meta.audio;
      if (result.level < lim.min_level_dbfs) problems.push("声が小さすぎます");
      if (result.clipRatio > lim.max_clip_ratio) problems.push("音が割れています");
      if (result.silenceRatio > lim.max_silence_ratio) problems.push("無音の部分が多すぎます");
      show($("#rec-check"), problems.length ? "このままだと不合格になりそうです: " + problems.join("、") : "よさそうです。聞き直して問題なければ提出してください。", !problems.length);
      $("#submit").disabled = problems.length > 0;
    };
    recorder.start(); started = performance.now();
    tick = setInterval(() => { $("#timer").textContent = ((performance.now() - started) / 1000).toFixed(1) + " 秒"; }, 100);
    $("#rec-btn").textContent = "停止"; $("#rec-btn").classList.add("on"); $("#rec-btn").setAttribute("aria-pressed", "true");
  }
  function stop() {
    clearInterval(tick); recorder.stop(); recorder = null;
    $("#rec-btn").textContent = "録り直す"; $("#rec-btn").classList.remove("on"); $("#rec-btn").setAttribute("aria-pressed", "false");
  }
  $("#rec-btn").onclick = () => (recorder ? stop() : start());
  $("#cancel").onclick = () => { if (recorder) stop(); $("#recorder").hidden = true; };

  $("#submit").onclick = async () => {
    const form = new FormData();
    form.append("file", result.wav, "recording.wav");
    $("#submit").disabled = true;
    try {
      await api(`/api/tasks/${current.id}/submissions`, { method: "POST", form });
      show(msg, "提出しました。審査が終わると結果が届きます。");
      $("#recorder").hidden = true; loadAll();
    } catch (err) {
      show($("#rec-check"), err.message + (err.reasons ? ": " + err.reasons.join("、") : ""), false);
      $("#submit").disabled = false;
    }
  };
  loadAll();
}

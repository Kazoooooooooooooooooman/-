import { api, $, show, el, yen, requireUser, statusLabel, pill, bar, date, rankText } from "/assets/api.js";
import { toWav } from "/assets/wav.js";

const me = await requireUser(["creator"]);
if (me) {
  const meta = await api("/api/meta");
  const msg = $("#msg");
  let current = null, recorder = null, chunks = [], started = 0, tick = null, stream = null, result = null, raf = null;
  $("#hold-days").textContent = meta.hold_days;
  $("#suspended-banner").hidden = !me.suspended;

  if (!me.consent_current) {
    $("#consent-banner").hidden = false;
    $("#consent-new").textContent = `同意書（${meta.consent.version}）: ${meta.consent.text}`;
    $("#consent-accept").onclick = async () => {
      await api("/api/account/consent", { method: "POST", json: { version: meta.consent.version } });
      $("#consent-banner").hidden = true; show(msg, "同意を記録しました。");
    };
  }

  function renderDashboard(d) {
    $("#month-label").textContent = `${d.month.label}の収入`;
    $("#month-total").textContent = yen(d.month.total_jpy);
    $("#month-task").textContent = yen(d.month.task_jpy);
    $("#month-royalty").textContent = d.royalties_on ? yen(d.month.royalty_jpy) : "レギュラーから";
    $("#goals").replaceChildren(...d.goals.map((g) => el("div", { class: "goal" },
      el("b", {}, `${yen(g.jpy)}　${g.label}`), el("span", { class: "muted num" }, g.reached ? "達成" : `あと${yen(g.jpy - d.month.total_jpy)}`),
      bar(g.progress, g.reached ? "" : "gold"))));
    $("#available").textContent = yen(d.available_jpy);
    $("#held").textContent = yen(d.held_jpy);
    $("#level-badge").textContent = d.level.label;
    $("#level-perk").textContent = d.level.perk;
    $("#level-next").textContent = d.next ? `次の「${d.next.label}」まで: ${d.next.needs.join("、")}` : "最上位のレベルです";
    const order = Object.keys(meta.levels);
    $("#level-steps").replaceChildren(...order.filter((k) => k !== "new").map((k) =>
      el("span", { class: order.indexOf(k) <= order.indexOf(d.level.key) ? "on" : "" }, meta.levels[k].label)));
    $("#ranks").replaceChildren(...(d.stats.ranks.length ? d.stats.ranks.map((r) => el("tr", {},
      el("td", {}, r.category_label), el("td", { class: "num" }, Math.round(r.score * 100)), el("td", { class: "num" }, r.reviewed),
      el("td", {}, rankText(r.percentile)),
      el("td", {}, me.industry ? (me.industry_verified ? rankText(r.industry_percentile) : "職種の確認待ち") : "—"),
    )) : [el("tr", {}, el("td", { colspan: 5, class: "muted" }, "審査を受けると品質スコアが表示されます"))]));
  }

  function taskCard(t) {
    const notes = [];
    if (!t.royalties) notes.push("買い切りのため、この仕事のデータには印税がつきません");
    if (t.license === "term_exclusive") notes.push("6ヶ月の独占のあと、カタログで印税の対象になります");
    return el("div", { class: "card task" },
      el("div", { class: "row" },
        t.promoted ? pill(["注目", "feat"]) : "", pill([t.category_label, ""]),
        t.tier !== "any" ? pill([t.tier_label, "gold"]) : "", t.industry ? pill([t.industry_label, "wait"]) : "",
        pill([t.license_label, ""])),
      el("p", {}, t.instructions || "自由に話してください"),
      el("p", { class: "big" }, yen(t.you_earn_jpy)),
      el("p", { class: "muted" }, `1件あたりのあなたの取り分 · あと${t.your_remaining}件まで · 締切 ${date(t.deadline_at)}`),
      ...notes.map((n) => el("p", { class: "muted" }, n)),
      el("button", { type: "button", class: "accent", onclick: () => openRecorder(t) }, "録音する"));
  }

  let showAllSubs = false;
  $("#subs-more").onclick = () => { showAllSubs = true; loadAll(); };

  async function loadAll() {
    const [dash, tasks, subs] = await Promise.all([api("/api/creator/dashboard"), api("/api/tasks"), api("/api/submissions/mine")]);
    renderDashboard(dash);
    $("#tasks").replaceChildren(...(tasks.length ? tasks.map(taskCard)
      : [el("p", { class: "muted" }, "今は受けられる仕事がありません。新しい注文が入るとここに表示されます。")]));
    const shown = showAllSubs ? subs : subs.slice(0, 10);
    $("#subs-more").hidden = showAllSubs || subs.length <= 10;
    $("#subs").replaceChildren(...(subs.length ? shown.map((s) => el("tr", {},
      el("td", {}, s.id), el("td", {}, "#" + s.order_id), el("td", { class: "num" }, s.duration_sec ? s.duration_sec + " 秒" : "—"),
      el("td", {}, pill(statusLabel[s.status] || [s.status])), el("td", {}, s.grade || "—"), el("td", {}, s.reason || ""),
    )) : [el("tr", {}, el("td", { colspan: 6, class: "muted" }, "まだ提出はありません"))]));
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

/* OnTime UI */
(function () {
  "use strict";
  const C = window.OnTimeCore;
  const $ = (id) => document.getElementById(id);
  const MIN = 60000;

  // ---------- 保存 ----------
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem("ontime." + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem("ontime." + k, JSON.stringify(v));
      } catch (e) {}
    },
  };
  let settings = Object.assign({}, C.DEFAULT_SETTINGS, store.get("settings", {}));
  let appts = store.get("appts", []).map((a) => Object.assign(a, { when: new Date(a.when) }));
  let travelMemo = store.get("travelMemo", {}); // 場所 → {min, route}
  let editingId = null;

  const toast = (msg) => {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (t.hidden = true), 2200);
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const toLocalInput = (d) => {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // ---------- フォーム <-> 約束 ----------
  function readForm() {
    const v = $("f-when").value;
    if (!v) return null;
    return {
      id: editingId || String(Date.now()),
      title: $("f-title").value.trim(),
      when: new Date(v),
      place: $("f-place").value.trim(),
      from: $("f-from").value.trim() || settings.home,
      travelMin: Number($("f-travel").value) || 0,
      route: $("f-route").value.trim(),
    };
  }
  function fillForm(a) {
    editingId = a.id || null;
    $("f-title").value = a.title || "";
    $("f-when").value = a.when ? toLocalInput(new Date(a.when)) : "";
    $("f-place").value = a.place || "";
    $("f-from").value = a.from || settings.home || "";
    $("f-travel").value = a.travelMin || "";
    $("f-route").value = a.route || "";
    render();
  }

  // ---------- STEP1: 解析 ----------
  function parse(text) {
    const r = C.parseMessage(text, new Date());
    const c = r.candidates;
    const chip = (kind, label, val) => `<button class="chip" data-k="${kind}" data-v="${esc(val)}">${esc(label)}</button>`;
    let html = "";
    if (c.dates.length > 1) html += `<div><span class="muted small">日付の候補:</span> ${c.dates.map((d) => chip("date", `${C.md(new Date(d.date))}（${d.raw}）`, new Date(d.date).toISOString())).join("")}</div>`;
    if (c.times.length > 1) html += `<div><span class="muted small">時刻の候補:</span> ${c.times.map((t) => chip("time", `${t.h}:${String(t.min).padStart(2, "0")}（${t.raw}）`, `${t.h}:${t.min}`)).join("")}</div>`;
    if (c.places.length > 1) html += `<div><span class="muted small">場所の候補:</span> ${c.places.map((p) => chip("place", p, p)).join("")}</div>`;
    $("cands").innerHTML = html ? `<p class="small">違っていたらタップで差し替え👇</p>${html}` : "";

    const memo = r.place && travelMemo[r.place];
    fillForm({
      title: $("f-title").value,
      when: r.when,
      place: r.place,
      from: settings.home,
      travelMin: memo ? memo.min : "",
      route: memo ? memo.route : "",
    });
    $("guess-warn").hidden = !r.timeGuessed;
    if (!r.when) toast("日時が見つかりませんでした。手で入力してください");
    else toast(`${C.md(r.when)} ${C.hm(r.when)}${r.place ? " / " + r.place : ""} を読み取りました`);
    $("step2").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("parse").onclick = () => parse($("msg").value);
  $("paste").onclick = async () => {
    try {
      $("msg").value = await navigator.clipboard.readText();
      parse($("msg").value);
    } catch (e) {
      toast("貼り付けできませんでした。長押しで貼り付けてください");
    }
  };
  $("cands").onclick = (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    const cur = $("f-when").value ? new Date($("f-when").value) : new Date();
    if (b.dataset.k === "date") {
      const d = new Date(b.dataset.v);
      cur.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
      $("f-when").value = toLocalInput(cur);
    } else if (b.dataset.k === "time") {
      const [h, m] = b.dataset.v.split(":").map(Number);
      cur.setHours(h, m, 0, 0);
      $("f-when").value = toLocalInput(cur);
    } else {
      $("f-place").value = b.dataset.v;
      const memo = travelMemo[b.dataset.v];
      if (memo) {
        $("f-travel").value = memo.min;
        $("f-route").value = memo.route || "";
      }
    }
    render();
  };

  // ---------- STEP2/3: 描画 ----------
  function renderRouteLinks(a) {
    const from = a.from || settings.home;
    const ok = from && a.place;
    for (const id of ["link-yahoo", "link-google"]) $(id).classList.toggle("disabled", !ok);
    if (ok) {
      const l = C.routeLinks(from, a.place, new Date(a.when - settings.arriveEarly * MIN));
      $("link-yahoo").href = l.yahoo;
      $("link-google").href = l.google;
    } else {
      $("link-yahoo").removeAttribute("href");
      $("link-google").removeAttribute("href");
    }
    const memo = a.place && travelMemo[a.place];
    $("travel-memo").textContent = !from
      ? "⚙ 設定で「家」を入れると乗換検索がワンタップになります"
      : memo
      ? `前回「${a.place}」へは ${memo.min}分でした`
      : "";
  }

  function timelineHtml(plan, now) {
    const st = C.status(plan, now);
    return plan.steps
      .map((s) => {
        const isCur = st.current === s && now < plan.when;
        const done = s.at < now && !isCur;
        return `<li class="k-${s.kind}${isCur ? " cur" : ""}${done ? " done" : ""}">
          <time>${C.hm(s.at)}</time>
          <div><b>${esc(s.label)}</b>${s.detail ? `<span class="muted small">${esc(s.detail)}</span>` : ""}</div>
        </li>`;
      })
      .join("");
  }

  function sendLinks(text) {
    const e = encodeURIComponent(text);
    return `<a class="btn sm" href="https://line.me/R/share?text=${e}" target="_blank" rel="noopener">LINEで送る</a>
      <a class="btn sm" href="mailto:?body=${e}">メール</a>
      <button class="btn sm ghost" data-copy="${esc(text)}">コピー</button>`;
  }

  function render() {
    const a = readForm();
    renderRouteLinks(a || { from: $("f-from").value, place: $("f-place").value, when: new Date() });
    if (!a) {
      $("summary").innerHTML = `<p class="muted">日時を入れるとタイムラインが出ます。</p>`;
      $("timeline").innerHTML = "";
      $("msgs").innerHTML = "";
      return;
    }
    const plan = C.buildPlan(a, settings);
    const now = new Date();
    const noTravel = !a.travelMin;
    const tooLate = plan.wake < now && a.when > now;
    $("summary").innerHTML = `
      <div class="big3">
        <div><span>${plan.wake < plan.latestWake ? "支度スタート" : "起きる"}</span><b>${C.hm(plan.wake < plan.latestWake ? plan.prepStart : plan.wake)}</b></div>
        <div class="hl"><span>家を出る</span><b>${C.hm(plan.leave)}</b></div>
        <div><span>約束</span><b>${C.hm(plan.when)}</b></div>
      </div>
      <p class="small">${C.md(plan.when)}　支度 ${plan.prepMin}分（×${settings.distraction}込み）＋ 移動 ${plan.travel}分 ＋ 保険 ${settings.delayBuffer}分 ＋ ${settings.arriveEarly}分前到着</p>
      ${noTravel ? `<p class="warn-text">⚠ 所要時間が0分です。STEP2の乗換検索で調べて入力してください。</p>` : ""}
      ${tooLate ? `<p class="warn-text">⚠ 起床時刻をもう過ぎています。今すぐ支度を始めて、間に合わなそうなら早めに遅刻連絡を！</p>` : ""}`;
    $("timeline").innerHTML = timelineHtml(plan, now);

    const eve = new Date(a.when);
    eve.setDate(eve.getDate() - 1);
    $("msgs").innerHTML = `
      <div class="msg"><div class="muted small">① 決まったらすぐ「了解」の返事</div><p>${esc(C.messages.confirm(a))}</p>${sendLinks(C.messages.confirm(a))}</div>
      <div class="msg"><div class="muted small">② 前日の夜にリマインド（${C.md(eve)}）</div><p>${esc(C.messages.remindEve(a))}</p>${sendLinks(C.messages.remindEve(a))}</div>
      <div class="msg"><div class="muted small">③ 遅れそうなら <b>気づいた瞬間に</b> 連絡</div><p>${esc(C.messages.late(a, 10, new Date(+a.when + 10 * MIN)))}</p>${sendLinks(C.messages.late(a, 10, new Date(+a.when + 10 * MIN)))}</div>`;
  }

  ["f-title", "f-when", "f-place", "f-from", "f-travel", "f-route"].forEach((id) => $(id).addEventListener("input", render));
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      toast("コピーしました");
    } catch (err) {
      toast("コピーできませんでした");
    }
  });

  // ---------- 保存・一覧 ----------
  function persist() {
    store.set("appts", appts);
  }
  $("save").onclick = () => {
    const a = readForm();
    if (!a) return toast("日時を入れてください");
    if (a.place && a.travelMin) travelMemo[a.place] = { min: a.travelMin, route: a.route };
    store.set("travelMemo", travelMemo);
    appts = appts.filter((x) => x.id !== a.id).concat(a).sort((x, y) => x.when - y.when);
    editingId = a.id;
    persist();
    renderList();
    scheduleNotifications();
    toast("保存しました");
  };

  function renderList() {
    const now = Date.now();
    const upcoming = appts.filter((a) => +a.when > now - 3 * 60 * MIN);
    $("list").innerHTML = upcoming.length
      ? upcoming
          .map((a) => {
            const p = C.buildPlan(a, settings);
            return `<li data-id="${a.id}">
              <div><b>${C.md(a.when)} ${C.hm(a.when)}</b> ${esc(a.title || a.place || "約束")}
                <div class="muted small">起床 ${C.hm(p.wake)} ／ 出発 ${C.hm(p.leave)}${a.place ? " ／ " + esc(a.place) : ""}</div></div>
              <div class="row"><button class="btn sm" data-act="open">開く</button><button class="btn sm ghost" data-act="del">削除</button></div>
            </li>`;
          })
          .join("")
      : `<li class="muted">まだありません</li>`;
    renderNow();
  }
  $("list").onclick = (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const id = b.closest("li").dataset.id;
    if (b.dataset.act === "del") {
      if (!confirm("この約束を削除しますか？")) return;
      appts = appts.filter((a) => a.id !== id);
      persist();
      renderList();
    } else {
      openAppt(id);
    }
  };
  function openAppt(id) {
    const a = appts.find((x) => x.id === id);
    if (!a) return;
    fillForm(a);
    $("step3").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- いまやること ----------
  function nextAppt() {
    const now = Date.now();
    return appts.find((a) => +a.when > now - 30 * MIN) || null;
  }
  function renderNow() {
    const a = nextAppt();
    const box = $("now");
    if (!a) return (box.hidden = true);
    const plan = C.buildPlan(a, settings);
    const now = new Date();
    // 前日準備の2時間前から表示
    if (now < new Date(+plan.nightPrep - 120 * MIN)) {
      box.hidden = false;
      $("now-title").textContent = a.title || a.place || "次の約束";
      $("now-when").textContent = `${C.md(a.when)} ${C.hm(a.when)}`;
      $("now-task").textContent = `起床 ${C.hm(plan.wake)} ／ 出発 ${C.hm(plan.leave)}`;
      $("now-next").textContent = `前日準備は ${C.md(plan.nightPrep)} ${C.hm(plan.nightPrep)} から`;
      $("now-countdown").textContent = "";
      return;
    }
    const st = C.status(plan, now);
    box.hidden = false;
    $("now-title").textContent = a.title || a.place || "次の約束";
    $("now-when").textContent = `${C.md(a.when)} ${C.hm(a.when)}`;
    $("now-task").textContent = st.current ? st.current.label : "まだ何もしなくてOK";
    $("now-next").textContent = st.next ? `次: ${C.hm(st.next.at)} ${st.next.label}` : "";
    const left = st.minutesToLeave;
    let cd;
    if (left > 0) cd = `出発まで あと <b>${Math.floor(left / 60) ? Math.floor(left / 60) + "時間" : ""}${left % 60}分</b>`;
    else if (st.lateMin > 0) cd = `<span class="late">このままだと約 ${st.lateMin}分 遅刻 → 今すぐ連絡！</span>`;
    else cd = `<span class="late">もう出発時刻です！</span>`;
    $("now-countdown").innerHTML = cd;
    box.classList.toggle("alert", left <= 15);
  }
  function shareOrOpen(text) {
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else window.open("https://line.me/R/share?text=" + encodeURIComponent(text), "_blank");
  }
  $("now-leaving").onclick = () => {
    const a = nextAppt();
    if (a) shareOrOpen(C.messages.leaving(a, C.buildPlan(a, settings), new Date()));
  };
  $("now-late").onclick = () => {
    const a = nextAppt();
    if (!a) return;
    const st = C.status(C.buildPlan(a, settings), new Date());
    const def = Math.max(st.lateMin, 5);
    const ans = prompt("何分くらい遅れそう？", String(def));
    if (ans == null) return;
    const late = Math.max(1, Number(ans) || def);
    shareOrOpen(C.messages.late(a, late, new Date(+a.when + late * MIN)));
  };
  $("now-open").onclick = () => {
    const a = nextAppt();
    if (a) openAppt(a.id);
  };

  // ---------- カレンダー / 通知 ----------
  $("ics").onclick = () => {
    const a = readForm();
    if (!a) return toast("日時を入れてください");
    const ics = C.buildIcs(a, C.buildPlan(a, settings), a.id);
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ontime-${C.md(a.when).replace(/[\/()]/g, "")}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  let timers = [];
  function notify(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((r) => r.showNotification(title, { body, icon: "icon.svg", tag: title }));
    } else new Notification(title, { body });
  }
  function scheduleNotifications() {
    timers.forEach(clearTimeout);
    timers = [];
    const now = Date.now();
    for (const a of appts) {
      const plan = C.buildPlan(a, settings);
      const name = a.title || a.place || "約束";
      const pts = [
        [plan.nightPrep, "🎒 明日の準備をしよう", `${name}：服・持ち物・充電・ルートを確認`],
        [plan.wake, "⏰ 起きる時間！", `${name}：${C.hm(plan.leave)}に家を出ます`],
        ...(plan.wake < plan.latestWake ? [[plan.prepStart, "🧺 支度スタート！", `今やってることを止める。${C.hm(plan.leave)}に出発`]] : []),
        [+plan.leave - 15 * MIN, "あと15分で出発", `${name}：持ち物チェック・トイレ`],
        [plan.leave, "🚪 今すぐ家を出る！", a.route || name],
      ];
      for (const [at, t, b] of pts) {
        const d = +at - now;
        if (d > 0 && d < 24 * 3600 * 1000) timers.push(setTimeout(() => notify(t, b), d));
      }
    }
  }
  $("notify").onclick = async () => {
    if (!("Notification" in window)) return toast("このブラウザは通知に対応していません");
    const p = await Notification.requestPermission();
    toast(p === "granted" ? "通知ON（アプリを開いている間）。確実にはカレンダー追加を！" : "通知が許可されませんでした");
    scheduleNotifications();
  };

  // ---------- 設定 ----------
  const numKeys = ["arriveEarly", "delayBuffer", "wakeBuffer", "distraction", "sleepHours"];
  function renderSettings() {
    $("s-home").value = settings.home || "";
    numKeys.forEach((k) => ($("s-" + k).value = settings[k]));
    $("routine").innerHTML = settings.routine
      .map(
        (r, i) => `<li data-i="${i}">
          <input class="r-name" value="${esc(r.name)}" />
          <input class="r-min" type="number" min="0" value="${r.min}" /><span class="small">分</span>
          <button class="btn sm ghost" data-r="up">↑</button><button class="btn sm ghost" data-r="del">✕</button>
        </li>`
      )
      .join("");
  }
  function saveSettings() {
    store.set("settings", settings);
    render();
    renderList();
    scheduleNotifications();
  }
  $("s-usualWake").value = settings.usualWake || "";
  $("s-usualWake").addEventListener("input", (e) => {
    settings.usualWake = e.target.value;
    saveSettings();
  });
  $("s-home").addEventListener("input", (e) => {
    const old = settings.home;
    settings.home = e.target.value.trim();
    if (!$("f-from").value || $("f-from").value === old) $("f-from").value = settings.home;
    saveSettings();
  });
  numKeys.forEach((k) =>
    $("s-" + k).addEventListener("input", (e) => {
      const v = Number(e.target.value);
      if (!isNaN(v) && e.target.value !== "") {
        settings[k] = v;
        saveSettings();
      }
    })
  );
  $("routine").addEventListener("input", (e) => {
    const li = e.target.closest("li");
    const r = settings.routine[+li.dataset.i];
    if (e.target.classList.contains("r-name")) r.name = e.target.value;
    else r.min = Number(e.target.value) || 0;
    saveSettings();
  });
  $("routine").addEventListener("click", (e) => {
    const b = e.target.closest("[data-r]");
    if (!b) return;
    const i = +b.closest("li").dataset.i;
    if (b.dataset.r === "del") settings.routine.splice(i, 1);
    else if (i > 0) [settings.routine[i - 1], settings.routine[i]] = [settings.routine[i], settings.routine[i - 1]];
    renderSettings();
    saveSettings();
  });
  $("add-task").onclick = () => {
    settings.routine.push({ name: "新しい支度", min: 5 });
    renderSettings();
    saveSettings();
  };

  // ---------- 起動 ----------
  renderSettings();
  if (!settings.home) $("settings").open = true;
  $("f-from").value = settings.home || "";
  render();
  renderList();
  scheduleNotifications();
  setInterval(() => {
    renderNow();
    if (readForm()) $("timeline").innerHTML = timelineHtml(C.buildPlan(readForm(), settings), new Date());
  }, 30 * 1000);

  // LINE / Gmail の「共有」から開かれた場合 (Web Share Target)
  const q = new URLSearchParams(location.search);
  const shared = [q.get("title"), q.get("text"), q.get("url")].filter(Boolean).join("\n");
  if (shared) {
    $("msg").value = shared;
    parse(shared);
    history.replaceState(null, "", location.pathname);
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();

/*
 * OnTime core — ブラウザと Node の両方で動く純粋ロジック。
 *   - parseMessage: LINE / Gmail の文面から「日付・時刻・場所」を抽出
 *   - buildPlan:    約束時刻から逆算して 起床〜出発〜到着 のタイムラインを作る
 *   - buildIcs:     アラーム付きカレンダー (.ics) を生成
 *   - messages:     ほうれん草用の定型文 (了解 / 出発報告 / 遅刻連絡)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.OnTimeCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const WEEKDAYS = "日月火水木金土";
  const MIN = 60 * 1000;

  // ---------- 文字正規化 ----------
  function normalize(text) {
    return String(text || "")
      .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/：/g, ":")
      .replace(/／/g, "/")
      .replace(/（/g, "(")
      .replace(/）/g, ")")
      .replace(/　/g, " ")
      .replace(/〜|～/g, "~");
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  // ---------- 日付 ----------
  // 戻り値: [{ date: Date(0:00), index, raw }]
  function findDates(text, base) {
    const today = startOfDay(base);
    const out = [];
    const push = (date, m) => out.push({ date, index: m.index, raw: m[0] });
    let m;

    const rel = /(今日|きょう|本日|明日|あした|あす|明後日|あさって|しあさって)/g;
    const relOffset = { 今日: 0, きょう: 0, 本日: 0, 明日: 1, あした: 1, あす: 1, 明後日: 2, あさって: 2, しあさって: 3 };
    while ((m = rel.exec(text))) push(addDays(today, relOffset[m[1]]), m);

    // 10/3, 10月3日, 2026/10/3
    const abs = /(?:(\d{4})[\/年])?(\d{1,2})(?:\/|月)(\d{1,2})日?/g;
    while ((m = abs.exec(text))) {
      const mon = +m[2], day = +m[3];
      if (mon < 1 || mon > 12 || day < 1 || day > 31) continue;
      // 「14:00/15:00」のような時刻の誤検出を避ける
      if (/\d:$/.test(text.slice(0, m.index)) || text[m.index + m[0].length] === ":") continue;
      let year = m[1] ? +m[1] : today.getFullYear();
      let d = new Date(year, mon - 1, day);
      if (!m[1] && d < addDays(today, -30)) d = new Date(year + 1, mon - 1, day); // 年越し
      push(d, m);
    }

    // 3日 (単独), 来週土曜, 土曜日, (土)
    const dayOnly = /(?<![\d\/月])(\d{1,2})日(?![間後前])/g;
    while ((m = dayOnly.exec(text))) {
      const day = +m[1];
      if (day < 1 || day > 31) continue;
      let d = new Date(today.getFullYear(), today.getMonth(), day);
      if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, day);
      push(d, m);
    }

    const wd = /(再来週|来週|今週)?の?([日月火水木金土])(?:曜日?|曜|\))/g;
    while ((m = wd.exec(text))) {
      // 「10/3(土)」の曜日は直前の日付の注記なので数えない
      if (/\d日?\s*\(?$/.test(text.slice(Math.max(0, m.index - 4), m.index))) continue;
      const target = WEEKDAYS.indexOf(m[2]);
      let diff = (target - today.getDay() + 7) % 7;
      if (m[1] === "来週" || m[1] === "再来週") {
        // 「来週X曜」= 次の月曜始まりの週の X曜
        const toNextMon = ((1 - today.getDay() + 7) % 7) || 7;
        const idx = (target + 6) % 7; // 月=0 … 日=6
        diff = toNextMon + idx + (m[1] === "再来週" ? 7 : 0);
      }
      push(addDays(today, diff), m);
    }
    return out;
  }

  // ---------- 時刻 ----------
  // 戻り値: [{ h, min, index, raw, guessed }]
  function findTimes(text) {
    const out = [];
    const re = /(午前|午後|朝の?|昼の?|夕方の?|夜の?|AM|PM|am|pm)?\s*(\d{1,2})(?::(\d{2})|時(?:(\d{1,2})分|(半))?)/g;
    let m;
    while ((m = re.exec(text))) {
      // 「10/3」の月など、日付の一部は除外
      const after = text[m.index + m[0].length];
      if (!m[3] && !m[0].includes("時")) continue;
      if (after === "間") continue; // 「2時間」
      // 「14:00~16:00」「18時から21時まで」の終了時刻は約束時刻ではない
      if (/[~\-]\s*$|から\s*$/.test(text.slice(Math.max(0, m.index - 3), m.index))) continue;
      if (text.startsWith("まで", m.index + m[0].length)) continue;
      let h = +m[2];
      let min = m[3] ? +m[3] : m[4] ? +m[4] : m[5] ? 30 : 0;
      if (h > 24 || min > 59) continue;
      const q = (m[1] || "").replace("の", "");
      let guessed = false;
      if (/午後|夕方|夜|PM|pm/.test(q) && h < 12) h += 12;
      else if (/昼/.test(q) && h < 6) h += 12;
      else if (!q && h >= 1 && h <= 7) { h += 12; guessed = true; } // 「3時に」はたいてい15時
      if (h === 24) h = 0;
      out.push({ h, min, index: m.index, raw: m[0].trim(), guessed });
    }
    return out;
  }

  // ---------- 場所 ----------
  const PLACE_CHARS = "[一-龯々〆ヵヶァ-ヴーｦ-ﾟA-Za-z0-9・&＆'’\\-]";
  const PLACE_SUFFIX =
    "(?:駅|口|前|改札|店|屋|カフェ|公園|ホール|館|センター|モール|ビル|タワー|大学|学校|高校|病院|ホテル|広場|スタジアム|ドーム|神社|寺|ランド|パーク|ヒルズ|町|丁目)";

  function cleanPlace(p) {
    return p
      .replace(/^(今日|明日|明後日|本日|来週|今週|再来週|午前|午後|朝|昼|夕方|夜|集合|場所|待ち合わせ)+/, "")
      .replace(/^[\d:\/年月日時分半]+/, "")
      .replace(/[・\-]+$/, "")
      .trim();
  }

  function findPlaces(text) {
    // 日付・時刻表現を先に取り除いて、地名と混ざらないようにする
    const t = text
      .replace(/(今日|本日|明日|明後日|再来週|来週|今週)/g, " ")
      .replace(/(午前|午後)?\d{1,2}(:\d{2}|時(\d{1,2}分|半)?)/g, " ")
      .replace(/\d{1,2}(\/|月)\d{1,2}日?/g, " ");
    const out = [];
    const add = (re, score) => {
      let m;
      while ((m = re.exec(t))) {
        const p = cleanPlace(m[1]);
        if (p.length >= 2) out.push({ place: p, index: m.index, score });
      }
    };
    add(new RegExp("(?:場所|集合場所|集合|待ち合わせ(?:場所)?|会場|住所)\\s*(?:は|:|→)\\s*(" + PLACE_CHARS + "+(?:の" + PLACE_CHARS + "+)?)", "g"), 3);
    add(new RegExp("(" + PLACE_CHARS + "+(?:の" + PLACE_CHARS + "+)?)\\s*(?:で|に)(?:集合|待ち合わせ|会お|会い|集ま|現地)", "g"), 2);
    add(new RegExp("(" + PLACE_CHARS + "*" + PLACE_SUFFIX + ")", "g"), 1);
    return out;
  }

  // ---------- メッセージ解析 ----------
  // 「最後に合意された」ものを優先: 基本は最後に出てきた候補。
  function parseMessage(text, base) {
    base = base ? new Date(base) : new Date();
    const t = normalize(text);
    const dates = findDates(t, base);
    const times = findTimes(t);
    const places = findPlaces(t);

    const last = (arr) => (arr.length ? arr.reduce((a, b) => (b.index >= a.index ? b : a)) : null);
    const date = last(dates);
    const time = last(times);
    const bestScore = places.reduce((s, p) => Math.max(s, p.score), 0);
    const place = last(places.filter((p) => p.score === bestScore));

    let when = null;
    if (time) {
      const d = date ? new Date(date.date) : startOfDay(base);
      d.setHours(time.h, time.min, 0, 0);
      // 日付指定なしで既に過ぎていたら翌日
      if (!date && d < base) d.setDate(d.getDate() + 1);
      when = d;
    }

    const uniq = (arr, key) => {
      const seen = new Set();
      return arr.filter((x) => (seen.has(key(x)) ? false : seen.add(key(x))));
    };
    return {
      when,
      place: place ? place.place : "",
      timeGuessed: time ? time.guessed : false,
      dateFound: !!date,
      candidates: {
        dates: uniq(dates.sort((a, b) => a.index - b.index), (d) => +d.date).map((d) => ({ date: d.date, raw: d.raw })),
        times: uniq(times.sort((a, b) => a.index - b.index), (x) => x.h * 60 + x.min).map((x) => ({ h: x.h, min: x.min, raw: x.raw })),
        places: uniq(places.sort((a, b) => a.index - b.index), (p) => p.place).map((p) => p.place),
      },
    };
  }

  // ---------- 逆算プラン ----------
  const DEFAULT_SETTINGS = {
    home: "",
    arriveEarly: 10, // 何分前に着くか
    delayBuffer: 5, // 電車遅延・迷子の保険
    wakeBuffer: 10, // 二度寝・ぼーっとする時間
    distraction: 1.3, // 気が散る係数 (支度にかかる時間の倍率)
    sleepHours: 7,
    usualWake: "07:00", // いつもの起床時刻 (空なら最終ラインで起きる)
    routine: [
      { name: "顔を洗う・トイレ", min: 10 },
      { name: "朝ごはん", min: 15 },
      { name: "着替え・身だしなみ", min: 15 },
      { name: "歯みがき", min: 5 },
      { name: "持ち物チェック・戸締り", min: 5 },
    ],
  };

  function buildPlan(appt, settings) {
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    const when = new Date(appt.when);
    const travel = Math.max(0, Number(appt.travelMin) || 0);
    const arriveBy = new Date(when - s.arriveEarly * MIN);
    const leave = new Date(arriveBy - (travel + s.delayBuffer) * MIN);

    const tasks = (s.routine || []).filter((r) => r.name && r.min > 0);
    const scaled = tasks.map((r) => ({ name: r.name, min: Math.ceil(r.min * s.distraction) }));
    const prepMin = scaled.reduce((a, r) => a + r.min, 0);
    const prepStart = new Date(leave - prepMin * MIN);
    const latestWake = new Date(prepStart - s.wakeBuffer * MIN);
    // いつもの起床時刻の方が早ければそちらで起き、支度開始はアラームで区切る
    let wake = latestWake;
    const uw = /^(\d{1,2}):(\d{2})$/.exec(s.usualWake || "");
    if (uw) {
      const u = new Date(prepStart);
      u.setHours(+uw[1], +uw[2], 0, 0);
      if (u < latestWake) wake = u;
    }
    const early = wake < latestWake;
    const bed = new Date(wake - s.sleepHours * 60 * MIN);
    const nightPrep = new Date(bed - 30 * MIN);

    const steps = [];
    const step = (at, label, kind, detail) => steps.push({ at: new Date(at), label, kind, detail: detail || "" });
    step(nightPrep, "前日の準備（服・持ち物・充電・ルート確認）", "night", "寝る前に全部そろえておく");
    step(bed, "寝る", "night", `${s.sleepHours}時間睡眠を確保`);
    if (early) {
      step(wake, "起きる", "wake", `遅くとも ${hm(latestWake)} が最終ライン`);
      step(wake, "自由時間", "buffer", `${hm(prepStart)} のアラームで必ず手を止める`);
      step(prepStart, "支度スタート（やってることを止める）", "start", `ここから ${prepMin}分で出発`);
    } else {
      step(wake, "起きる（これが最終ライン）", "wake", "アラームが鳴ったらすぐカーテンを開ける");
      if (s.wakeBuffer > 0) step(wake, `ぼーっとタイム（最大${s.wakeBuffer}分）`, "buffer", "ここでスマホを見ない");
    }
    let cur = new Date(prepStart);
    for (const r of scaled) {
      step(cur, r.name, "task", `${r.min}分`);
      cur = new Date(cur.getTime() + r.min * MIN);
    }
    step(leave, "家を出る", "leave", appt.route ? appt.route : `移動 ${travel}分 + 保険 ${s.delayBuffer}分`);
    step(arriveBy, `到着（${s.arriveEarly}分前）`, "arrive", appt.place || "");
    step(when, "約束の時間", "appt", appt.place || "");
    // 同時刻は定義順を保つ
    steps.sort((a, b) => a.at - b.at);

    return { when, wake, latestWake, prepStart, bed, nightPrep, leave, arriveBy, travel, prepMin, steps, settings: s };
  }

  // 今この瞬間に何をすべきか / 間に合うか
  function status(plan, now) {
    now = new Date(now || Date.now());
    const cur = [...plan.steps].reverse().find((st) => st.at <= now) || null;
    const next = plan.steps.find((st) => st.at > now) || null;
    // 今から支度を最短で終えて出たときの到着見込み
    let eta;
    if (now <= plan.wake) eta = plan.arriveBy;
    else if (now <= plan.leave) eta = plan.arriveBy;
    else eta = new Date(now.getTime() + (plan.travel + plan.settings.delayBuffer) * MIN);
    const lateMin = Math.max(0, Math.ceil((eta - plan.when) / MIN));
    return { current: cur, next, eta, lateMin, minutesToLeave: Math.ceil((plan.leave - now) / MIN) };
  }

  // ---------- 表示ユーティリティ ----------
  const pad = (n) => String(n).padStart(2, "0");
  const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const md = (d) => `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;

  // ---------- ほうれん草メッセージ ----------
  const messages = {
    confirm: (a) => `了解！${md(a.when)} ${hm(a.when)}に${a.place || "（場所）"}で！`,
    remindEve: (a) => `明日${hm(a.when)}に${a.place || "（場所）"}でよろしくね！`,
    leaving: (a, plan, now) => {
      const eta = new Date(new Date(now || Date.now()).getTime() + plan.travel * MIN);
      return `今家を出ました！${a.place || "目的地"}には${hm(eta)}ごろ着く予定です。`;
    },
    late: (a, lateMin, eta) =>
      `ごめんなさい、${lateMin}分ほど遅れそうです。${hm(eta)}ごろ${a.place || "現地"}に着きます。先に始めていてください🙏`,
  };

  // ---------- 経路リンク ----------
  function routeLinks(from, to, when) {
    const e = encodeURIComponent;
    const w = new Date(when);
    const mm = pad(w.getMinutes());
    return {
      yahoo:
        `https://transit.yahoo.co.jp/search/result?from=${e(from)}&to=${e(to)}` +
        `&y=${w.getFullYear()}&m=${pad(w.getMonth() + 1)}&d=${pad(w.getDate())}` +
        `&hh=${w.getHours()}&m1=${mm[0]}&m2=${mm[1]}&type=4&ticket=ic&expkind=1&ws=3&s=0`,
      google:
        `https://www.google.com/maps/dir/?api=1&origin=${e(from)}&destination=${e(to)}&travelmode=transit`,
    };
  }

  // ---------- .ics (カレンダー + アラーム) ----------
  function icsDate(d) {
    return (
      d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" +
      pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z"
    );
  }
  function icsEscape(s) {
    return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => "\\" + c);
  }
  function buildIcs(appt, plan, uid) {
    const stamp = icsDate(new Date());
    const ev = (id, start, end, summary, desc, alarmsMin) => {
      const lines = [
        "BEGIN:VEVENT",
        `UID:${uid}-${id}@ontime`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${icsDate(start)}`,
        `DTEND:${icsDate(end)}`,
        `SUMMARY:${icsEscape(summary)}`,
        `DESCRIPTION:${icsEscape(desc)}`,
      ];
      if (appt.place) lines.push(`LOCATION:${icsEscape(appt.place)}`);
      for (const a of alarmsMin) {
        lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(summary)}`, `TRIGGER:-PT${a}M`, "END:VALARM");
      }
      lines.push("END:VEVENT");
      return lines.join("\r\n");
    };
    const title = appt.title || appt.place || "約束";
    const timeline = plan.steps.map((s) => `${hm(s.at)} ${s.label}`).join("\n");
    const body = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//OnTime//JP",
      "CALSCALE:GREGORIAN",
      ev("wake", plan.wake, new Date(plan.wake.getTime() + 5 * MIN), `⏰ 起きる（${title}）`, timeline, [0]),
      ...(plan.wake < plan.latestWake
        ? [ev("start", plan.prepStart, new Date(plan.prepStart.getTime() + 5 * MIN), `🧺 支度スタート（${title}）`, timeline, [0])]
        : []),
      ev("leave", plan.leave, new Date(plan.leave.getTime() + 5 * MIN), `🚪 家を出る → ${title}`, appt.route || timeline, [15, 5, 0]),
      ev("appt", plan.when, new Date(plan.when.getTime() + 60 * MIN), title, timeline, []),
      ev("night", plan.nightPrep, new Date(plan.nightPrep.getTime() + 15 * MIN), `🎒 明日の準備（${title}）`, timeline, [0]),
      "END:VCALENDAR",
    ];
    return body.join("\r\n") + "\r\n";
  }

  return { normalize, parseMessage, buildPlan, status, buildIcs, routeLinks, messages, hm, md, DEFAULT_SETTINGS };
});

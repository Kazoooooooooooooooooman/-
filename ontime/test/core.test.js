// node --test ontime/test/*.test.js
const test = require("node:test");
const assert = require("node:assert");
const C = require("../core.js");

// 2026-09-25 (金) 20:00 を「今」とする
const BASE = new Date(2026, 8, 25, 20, 0);
const ymdhm = (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];

test("LINEの会話: 最後に決まった日時・場所を拾う", () => {
  const text = `A: 明日どこ行く？
B: 13時に新宿とかどう？
A: いや、渋谷がいいな
B: じゃあ明日14時半に渋谷駅ハチ公前で集合ね！
A: おけ！`;
  const r = C.parseMessage(text, BASE);
  assert.deepStrictEqual(ymdhm(r.when), [2026, 9, 26, 14, 30]);
  assert.strictEqual(r.place, "渋谷駅ハチ公前");
});

test("Gmail: 場所: と 月日・曜日・午後", () => {
  const text = "日時：１０月３日（土）午後２時\n場所：東京国際フォーラム ホールC\nよろしくお願いします。";
  const r = C.parseMessage(text, BASE);
  assert.deepStrictEqual(ymdhm(r.when), [2026, 10, 3, 14, 0]);
  assert.strictEqual(r.place, "東京国際フォーラム");
});

test("時間帯の終了時刻は無視する / HH:MM", () => {
  const r = C.parseMessage("10/4 10:00~12:00 横浜駅西口改札", BASE);
  assert.deepStrictEqual(ymdhm(r.when), [2026, 10, 4, 10, 0]);
  assert.strictEqual(r.place, "横浜駅西口改札");
});

test("来週の曜日 と 午前/午後なしの推測", () => {
  const r = C.parseMessage("来週の水曜3時にスタバで待ち合わせで", BASE);
  assert.deepStrictEqual(ymdhm(r.when), [2026, 9, 30, 15, 0]);
  assert.strictEqual(r.timeGuessed, true);
  assert.strictEqual(r.place, "スタバ");
});

test("「2時間」は時刻ではない", () => {
  const r = C.parseMessage("明日は2時間くらい遊べるよ。10時に池袋駅東口で", BASE);
  assert.deepStrictEqual(ymdhm(r.when), [2026, 9, 26, 10, 0]);
  assert.strictEqual(r.place, "池袋駅東口");
});

test("逆算プラン: 出発・起床・就寝", () => {
  const plan = C.buildPlan(
    { when: new Date(2026, 8, 26, 10, 0), travelMin: 40 },
    { arriveEarly: 10, delayBuffer: 5, wakeBuffer: 10, distraction: 1, sleepHours: 7, usualWake: "",
      routine: [{ name: "朝ごはん", min: 20 }, { name: "着替え", min: 10 }] }
  );
  assert.deepStrictEqual(ymdhm(plan.arriveBy).slice(3), [9, 50]);
  assert.deepStrictEqual(ymdhm(plan.leave).slice(3), [9, 5]); // 9:50 - 45分
  assert.deepStrictEqual(ymdhm(plan.wake).slice(3), [8, 25]); // 9:05 - 30分 - 10分
  assert.deepStrictEqual(ymdhm(plan.bed), [2026, 9, 26, 1, 25]);
  const labels = plan.steps.map((s) => s.label);
  assert.ok(labels.indexOf("家を出る") < labels.indexOf("約束の時間"));
});

test("気が散る係数で支度時間が伸びる", () => {
  const a = { when: new Date(2026, 8, 26, 10, 0), travelMin: 30 };
  const r = [{ name: "支度", min: 30 }];
  const p1 = C.buildPlan(a, { distraction: 1, routine: r });
  const p2 = C.buildPlan(a, { distraction: 1.5, routine: r });
  assert.strictEqual((p1.latestWake - p2.latestWake) / 60000, 15);
});

test("午後の約束はいつもの時刻に起きて、支度開始をアラームで区切る", () => {
  const plan = C.buildPlan(
    { when: new Date(2026, 8, 26, 14, 30), travelMin: 25 },
    { usualWake: "07:30", distraction: 1, routine: [{ name: "支度", min: 40 }] }
  );
  assert.deepStrictEqual(ymdhm(plan.wake).slice(3), [7, 30]);
  assert.deepStrictEqual(ymdhm(plan.prepStart).slice(3), [13, 10]); // 13:50出発 - 40分
  assert.deepStrictEqual(ymdhm(plan.bed), [2026, 9, 26, 0, 30]);
  assert.ok(plan.steps.some((s) => s.kind === "start"));
  assert.match(C.buildIcs({ when: plan.when }, plan, "y"), /支度スタート/);
});

test("遅刻見込みの計算", () => {
  const plan = C.buildPlan({ when: new Date(2026, 8, 26, 10, 0), travelMin: 30 }, { arriveEarly: 10, delayBuffer: 5 });
  const s = C.status(plan, new Date(2026, 8, 26, 9, 40));
  assert.strictEqual(s.lateMin, 15); // 9:40 + 35分 = 10:15
  assert.strictEqual(C.status(plan, new Date(2026, 8, 26, 8, 0)).lateMin, 0);
});

test(".ics にアラームが入る", () => {
  const appt = { when: new Date(2026, 8, 26, 10, 0), travelMin: 30, place: "渋谷, 駅" };
  const ics = C.buildIcs(appt, C.buildPlan(appt), "x");
  assert.match(ics, /BEGIN:VALARM/);
  assert.match(ics, /LOCATION:渋谷\\, 駅/);
  assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, 5); // 準備・起床・支度開始・出発・約束
});

test("カスタマイズ: 前日準備・睡眠を消せる / サバ読みで前倒し / 最初の一歩", () => {
  const a = { when: new Date(2026, 8, 26, 10, 0), travelMin: 30 };
  const base = C.buildPlan(a, { usualWake: "" });
  const p = C.buildPlan(a, { usualWake: "", nightPrepMin: 0, sleepHours: 0, fakeEarly: 10 });
  assert.ok(!p.steps.some((s) => s.kind === "night"));
  assert.strictEqual((base.leave - p.leave) / 60000, 10);
  assert.strictEqual(p.steps.find((s) => s.kind === "task").first, "洗面所まで歩くだけ");
});

test("当日モード: ペースの判定", () => {
  const plan = C.buildPlan(
    { when: new Date(2026, 8, 26, 10, 0), travelMin: 30 },
    { usualWake: "", distraction: 1, arriveEarly: 10, delayBuffer: 5,
      routine: [{ name: "A", min: 10 }, { name: "B", min: 20 }] }
  );
  // 出発 9:15, 支度開始 8:45
  assert.deepStrictEqual(ymdhm(plan.prepStart).slice(3), [8, 45]);
  // 予定どおり
  let s = C.pace(plan, 0, null, new Date(2026, 8, 26, 8, 45));
  assert.strictEqual(s.slackMin, 0);
  // 10分ダラダラして何も始めていない → 10分遅れ
  s = C.pace(plan, 0, null, new Date(2026, 8, 26, 8, 55));
  assert.strictEqual(s.notStarted, true);
  assert.strictEqual(s.slackMin, -10);
  // Aを早めに5分で終わらせた → 5分の余裕
  s = C.pace(plan, 1, new Date(2026, 8, 26, 8, 50), new Date(2026, 8, 26, 8, 50));
  assert.strictEqual(s.slackMin, 5);
  assert.strictEqual(s.task.label, "B");
  // Bが3分オーバー中
  s = C.pace(plan, 1, new Date(2026, 8, 26, 8, 50), new Date(2026, 8, 26, 9, 13));
  assert.strictEqual(s.overMin, 3);
  assert.strictEqual(s.slackMin, 1); // Aで稼いだ5分をほぼ使い切った
});

test("支度の分数は設定どおり。気が散る分は「よゆう時間」に分けて出す", () => {
  const plan = C.buildPlan(
    { when: new Date(2026, 8, 26, 12, 0), travelMin: 30 },
    { usualWake: "", distraction: 1.3, routine: [{ name: "勉強", min: 100 }, { name: "朝ごはん", min: 30 }] }
  );
  const tasks = plan.steps.filter((s) => s.kind === "task");
  assert.deepStrictEqual(tasks.map((t) => t.min), [100, 30]);
  assert.strictEqual(plan.slackMin, 39);
  const slack = plan.steps.find((s) => s.kind === "slack");
  assert.strictEqual(+slack.at, +plan.leave - 39 * 60000);
  // 予定どおりに始めれば、よゆう時間の分だけ余裕がある
  assert.strictEqual(C.pace(plan, 0, plan.prepStart, plan.prepStart).slackMin, 39);
});

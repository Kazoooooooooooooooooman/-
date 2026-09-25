// node --test ontime/test/*.test.js
const test = require("node:test");
const assert = require("node:assert");
const T = require("../transit.js");

// Routes API (TRANSIT) のレスポンスを模したもの: 徒歩 → 中央線 → 乗換徒歩 → 山手線 → 徒歩
const FIXTURE = {
  routes: [{
    duration: "1920s",
    legs: [{
      steps: [
        { travelMode: "WALK", staticDuration: "300s" },
        { travelMode: "WALK", staticDuration: "120s" },
        { travelMode: "TRANSIT", staticDuration: "300s", transitDetails: {
          stopDetails: { departureStop: { name: "中野" }, arrivalStop: { name: "新宿" },
            departureTime: "2026-09-27T04:59:00Z", arrivalTime: "2026-09-27T05:04:00Z" },
          headsign: "東京", stopCount: 1,
          transitLine: { name: "JR中央線快速", nameShort: "中央線快速", color: "#f15a22", vehicle: { name: { text: "電車" } } } } },
        { travelMode: "WALK", staticDuration: "180s" },
        { travelMode: "TRANSIT", staticDuration: "420s", transitDetails: {
          stopDetails: { departureStop: { name: "新宿" }, arrivalStop: { name: "渋谷" },
            departureTime: "2026-09-27T05:08:00Z", arrivalTime: "2026-09-27T05:15:00Z" },
          headsign: "渋谷・品川方面", stopCount: 3,
          transitLine: { name: "JR山手線", color: "#80c241" } } },
        { travelMode: "WALK", staticDuration: "240s" },
      ],
    }],
  }],
};

test("検索リクエスト: 到着時刻指定・電車・日本語", () => {
  const r = T.buildRequest("中野駅", "渋谷駅ハチ公前", new Date("2026-09-27T05:20:00Z"));
  assert.strictEqual(r.travelMode, "TRANSIT");
  assert.strictEqual(r.arrivalTime, "2026-09-27T05:20:00.000Z");
  assert.strictEqual(r.languageCode, "ja");
  assert.deepStrictEqual(r.origin, { address: "中野駅" });
});

test("レスポンスを 出発時刻・乗る電車 の形にそろえる", () => {
  const n = T.normalize(FIXTURE, new Date("2026-09-27T05:20:00Z"));
  assert.strictEqual(n.walk, 7); // 家→駅
  assert.strictEqual(n.after, 4); // 駅→目的地
  assert.strictEqual(n.transferWalk, 3);
  assert.strictEqual(n.departAt, "2026-09-27T04:52:00.000Z"); // 4:59 発の7分前に家を出る
  assert.strictEqual(n.arriveAt, "2026-09-27T05:19:00.000Z");
  assert.strictEqual(n.total, 27);
  assert.deepStrictEqual(n.legs.map((l) => [l.line, l.from, l.to, l.min]), [
    ["中央線快速", "中野", "新宿", 5],
    ["JR山手線", "新宿", "渋谷", 7],
  ]);
});

test("経路なし → null", () => {
  assert.strictEqual(T.normalize({}, new Date()), null);
});

test("search: APIキーとフィールドマスクを付けて呼び、エラーは日本語で投げる", async () => {
  let seen;
  const ok = async (url, opt) => {
    seen = opt;
    return { ok: true, json: async () => FIXTURE };
  };
  const n = await T.search("KEY123", "中野駅", "渋谷駅", new Date("2026-09-27T05:20:00Z"), ok);
  assert.strictEqual(seen.headers["X-Goog-Api-Key"], "KEY123");
  assert.match(seen.headers["X-Goog-FieldMask"], /transitDetails/);
  assert.strictEqual(n.legs.length, 2);

  const ng = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: "API key not valid" } }) });
  await assert.rejects(T.search("bad", "a", "b", new Date(), ng), /API key not valid/);
});

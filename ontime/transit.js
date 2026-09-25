/*
 * 乗換検索 (Google Maps Platform Routes API / TRANSIT)
 *   - buildRequest: 「何時までに着きたいか」を指定した検索リクエストを作る
 *   - normalize:    レスポンスを アプリで使う形 {departAt, legs[], ...} にそろえる
 * APIキーはサーバー側 (server.js) だけが持ち、ブラウザには渡さない。
 */
"use strict";

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELD_MASK = [
  "routes.duration",
  "routes.legs.steps.travelMode",
  "routes.legs.steps.staticDuration",
  "routes.legs.steps.transitDetails",
].join(",");

function buildRequest(from, to, arriveBy) {
  return {
    origin: { address: from },
    destination: { address: to },
    travelMode: "TRANSIT",
    arrivalTime: new Date(arriveBy).toISOString(),
    languageCode: "ja",
    regionCode: "JP",
    computeAlternativeRoutes: false,
  };
}

const secs = (d) => Number(String(d || "0s").replace("s", "")) || 0;
const mins = (ms) => Math.round(ms / 60000);

function normalize(json, arriveBy) {
  const route = json && json.routes && json.routes[0];
  if (!route) return null;
  const steps = (route.legs || []).flatMap((l) => l.steps || []);
  const legs = [];
  let walkBefore = 0, walkAfter = 0, transfers = 0;
  for (const st of steps) {
    const td = st.transitDetails;
    if (st.travelMode === "TRANSIT" && td) {
      const sd = td.stopDetails || {};
      const line = td.transitLine || {};
      const dep = new Date(sd.departureTime);
      const arr = new Date(sd.arrivalTime);
      transfers += walkAfter; // 乗り換えの徒歩
      walkAfter = 0;
      legs.push({
        line: line.nameShort || line.name || (line.vehicle && line.vehicle.name && line.vehicle.name.text) || "電車",
        color: line.color || "#8a9691",
        from: (sd.departureStop && sd.departureStop.name) || "",
        to: (sd.arrivalStop && sd.arrivalStop.name) || "",
        headsign: td.headsign || "",
        dep: dep.toISOString(),
        arr: arr.toISOString(),
        min: mins(arr - dep),
        stops: td.stopCount || 0,
      });
    } else if (!legs.length) walkBefore += secs(st.staticDuration);
    else walkAfter += secs(st.staticDuration);
  }
  let departAt, arriveAt;
  if (legs.length) {
    departAt = new Date(new Date(legs[0].dep) - walkBefore * 1000);
    arriveAt = new Date(+new Date(legs[legs.length - 1].arr) + walkAfter * 1000);
  } else {
    // 徒歩だけで行ける場合
    arriveAt = new Date(arriveBy);
    departAt = new Date(arriveAt - secs(route.duration) * 1000);
  }
  return {
    source: "google",
    departAt: departAt.toISOString(),
    arriveAt: arriveAt.toISOString(),
    total: mins(arriveAt - departAt),
    walk: Math.round(walkBefore / 60),
    after: Math.round(walkAfter / 60),
    transferWalk: Math.round(transfers / 60),
    legs,
  };
}

async function search(apiKey, from, to, arriveBy, fetchImpl) {
  const res = await (fetchImpl || fetch)(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify(buildRequest(from, to, arriveBy)),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json.error && json.error.message) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return normalize(json, arriveBy);
}

module.exports = { buildRequest, normalize, search, ENDPOINT, FIELD_MASK };

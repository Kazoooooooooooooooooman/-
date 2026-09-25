#!/usr/bin/env node
/*
 * OnTime ローカルサーバー
 *   GOOGLE_MAPS_API_KEY=xxxx node ontime/server.js
 *   → http://localhost:8787 を開く
 *
 * - ontime/ のファイルを配信する
 * - POST /api/route で本物の乗換検索 (Google Routes API) を中継する
 *   APIキーはこのサーバーの中だけで使い、ブラウザには渡さない。
 *   検索内容 (出発地・目的地) はログに残さない。
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const transit = require("./transit.js");

const PORT = Number(process.env.PORT) || 8787;
const KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const ROOT = __dirname;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

const cache = new Map(); // 同じ検索を短時間に繰り返さない (料金対策)
const CACHE_MS = 10 * 60 * 1000;

function send(res, code, body, type) {
  res.writeHead(code, { "Content-Type": type || "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 10000) reject(new Error("too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function route(req, res) {
  if (!KEY) return send(res, 503, { error: "GOOGLE_MAPS_API_KEY が設定されていません" });
  let q;
  try {
    q = JSON.parse(await readBody(req));
  } catch (e) {
    return send(res, 400, { error: "リクエストの形式が正しくありません" });
  }
  const from = String(q.from || "").slice(0, 200).trim();
  const to = String(q.to || "").slice(0, 200).trim();
  const arriveBy = new Date(q.arriveBy);
  if (!from || !to || isNaN(arriveBy)) return send(res, 400, { error: "出発地・目的地・到着時刻が必要です" });

  const key = `${from}|${to}|${+arriveBy}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return send(res, 200, hit.data);
  try {
    const data = await transit.search(KEY, from, to, arriveBy);
    if (!data) return send(res, 404, { error: "経路が見つかりませんでした。場所の名前を変えてみてください" });
    cache.set(key, { at: Date.now(), data });
    send(res, 200, data);
  } catch (e) {
    console.error("乗換検索に失敗:", e.status || "", e.message);
    send(res, 502, { error: "乗換検索に失敗しました: " + e.message });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/status") return send(res, 200, { transit: !!KEY });
  if (url.pathname === "/api/route" && req.method === "POST") return route(req, res);
  if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });

  const rel = url.pathname === "/" ? "chat-demo.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || /(^|[\/\\])(\.|server\.js|transit\.js|test)/.test(rel)) return send(res, 404, "not found", "text/plain");
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, "not found", "text/plain");
    send(res, 200, buf, TYPES[path.extname(file)] || "application/octet-stream");
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`OnTime: http://localhost:${PORT} を開いてください`);
  console.log(KEY ? "乗換検索: Google Routes API を使います" : "乗換検索: APIキーが無いのでデモ経路で動きます (GOOGLE_MAPS_API_KEY を設定すると本物になります)");
});

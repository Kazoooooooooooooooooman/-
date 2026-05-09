// ClaudeFinance — USD/JPY 週末方向検出
// 対象: 2026-05-09 (土) / 2026-05-10 (日)
// 戦略: 週末は外為クローズ。直前スポット + USD強弱 + 円クロス整合性 +
//       モメンタムから「次回オープン (NZ/シドニー早朝)」のギャップ方向を推定。

const TARGET_WEEKEND = ['2026-05-09', '2026-05-10'];
const REFRESH_MS = 30_000;
const HISTORY_MAX = 240; // 約2時間ぶん (30sティック)

const state = {
  ticks: [],            // [{t, usdjpy, eurusd, gbpusd, usdchf, eurjpy, gbpjpy}]
  fridayClose: null,    // 直近金曜の引け推定値
  history: [],          // frankfurter から取得した過去2週間の日次データ
  lastDirection: null,
};

const $ = (id) => document.getElementById(id);

const fmt = (n, d = 3) => (n == null || isNaN(n)) ? '--' : Number(n).toFixed(d);
const sign = (n) => n > 0 ? '+' : '';
const pct = (n) => (n == null || isNaN(n)) ? '--' : `${sign(n)}${(n*100).toFixed(2)}%`;

function logEvent(msg) {
  const li = document.createElement('li');
  const t = new Date().toLocaleTimeString('ja-JP');
  li.innerHTML = `<b>[${t}]</b> ${msg}`;
  const ul = $('log');
  ul.prepend(li);
  while (ul.children.length > 60) ul.removeChild(ul.lastChild);
}

// --- データ取得 (キー不要のフリーAPIをフォールバックで多重化) ---
// 1) open.er-api.com — 比較的更新頻度高め
// 2) fawazahmed0/currency-api (jsdelivr CDN) — 安定、毎日更新
// 3) frankfurter.app — ECB毎営業日
async function fetchFromOpenErApi() {
  const r = await fetch('https://open.er-api.com/v6/latest/USD');
  if (!r.ok) throw new Error('open.er-api status ' + r.status);
  const j = await r.json();
  if (j.result !== 'success' || !j.rates) throw new Error('open.er-api bad payload');
  return { JPY: j.rates.JPY, EUR: j.rates.EUR, GBP: j.rates.GBP, CHF: j.rates.CHF, _src: 'open.er-api' };
}

async function fetchFromFawaz() {
  const url = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json';
  const r = await fetch(url);
  if (!r.ok) throw new Error('fawaz status ' + r.status);
  const j = await r.json();
  const u = j.usd;
  if (!u) throw new Error('fawaz bad payload');
  return { JPY: u.jpy, EUR: u.eur, GBP: u.gbp, CHF: u.chf, _src: 'fawazahmed0' };
}

async function fetchFromFrankfurter() {
  const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=JPY,EUR,GBP,CHF');
  if (!r.ok) throw new Error('frankfurter status ' + r.status);
  const j = await r.json();
  if (!j.rates) throw new Error('frankfurter bad payload');
  return { JPY: j.rates.JPY, EUR: j.rates.EUR, GBP: j.rates.GBP, CHF: j.rates.CHF, _src: 'frankfurter' };
}

async function fetchRatesUSD() {
  const sources = [fetchFromOpenErApi, fetchFromFawaz, fetchFromFrankfurter];
  let lastErr;
  for (const fn of sources) {
    try {
      const r = await fn();
      if (r.JPY && r.EUR && r.GBP && r.CHF) return r;
    } catch (e) { lastErr = e; console.warn('[claudefinance] source failed', e); }
  }
  throw lastErr || new Error('全データソース取得失敗');
}

async function fetchSpot() {
  const r = await fetchRatesUSD();
  const usdjpy = r.JPY;
  const eurusd = 1 / r.EUR;
  const gbpusd = 1 / r.GBP;
  const usdchf = r.CHF;
  const eurjpy = eurusd * usdjpy;
  const gbpjpy = gbpusd * usdjpy;
  return { t: Date.now(), usdjpy, eurusd, gbpusd, usdchf, eurjpy, gbpjpy, _src: r._src };
}

// 過去14日分の日次データ (frankfurter, ECB営業日, キー不要)
async function fetchHistory() {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const startD = new Date(today.getTime() - 21 * 86400 * 1000);
  const start = startD.toISOString().slice(0, 10);
  const url = `https://api.frankfurter.app/${start}..${end}?from=USD&to=JPY,EUR,GBP,CHF`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('frankfurter status ' + r.status);
    const j = await r.json();
    if (!j.rates) throw new Error('frankfurter no rates');
    const days = Object.keys(j.rates).sort();
    state.history = days.map(d => {
      const x = j.rates[d];
      return {
        date: d,
        t: new Date(d + 'T22:00:00Z').getTime(),
        usdjpy: x.JPY,
        eurusd: x.EUR ? 1 / x.EUR : null,
        gbpusd: x.GBP ? 1 / x.GBP : null,
        usdchf: x.CHF,
        eurjpy: x.EUR && x.JPY ? (1 / x.EUR) * x.JPY : null,
        gbpjpy: x.GBP && x.JPY ? (1 / x.GBP) * x.JPY : null,
      };
    });
    if (state.history.length) {
      const last = state.history[state.history.length - 1];
      state.fridayClose = {
        usdjpy: last.usdjpy, eurusd: last.eurusd, gbpusd: last.gbpusd, usdchf: last.usdchf,
      };
      logEvent(`過去 ${state.history.length} 営業日取得 (${state.history[0].date}〜${last.date}) / 直近引け USDJPY=${fmt(last.usdjpy,3)}`);
    }
  } catch (e) {
    logEvent(`履歴取得失敗: ${e.message} → ライブティックのみで動作`);
    console.error(e);
  }
}

// --- マーケットステート ---
function marketState(now = new Date()) {
  // 簡易: UTC基準で 金 22:00 〜 日 22:00 をクローズ扱い
  const day = now.getUTCDay();   // 0=Sun, 6=Sat
  const h = now.getUTCHours();
  const closed =
    (day === 5 && h >= 22) ||
    (day === 6) ||
    (day === 0 && h < 22);
  return closed ? 'closed' : 'open';
}

// --- シグナル計算 ---
function pctChange(a, b) { return (a == null || b == null) ? null : (a - b) / b; }

function rolling(arr, n, key) {
  const slice = arr.slice(-n);
  if (!slice.length) return null;
  return slice.map(x => x[key]).filter(v => v != null);
}

function stdev(xs) {
  if (xs.length < 2) return null;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

// 履歴（日次）とライブティックを結合した時系列を返す
function combinedSeries() {
  return [...state.history, ...state.ticks];
}

// 各シグナルは [-1, +1] のスコアを返す。+ = 円安 (USDJPY上), - = 円高 (USDJPY下)
function signalMomentum() {
  const series = combinedSeries();
  if (series.length < 4) return { score: 0, label: 'データ不足', cls: 'flat' };
  const last = series[series.length - 1].usdjpy;
  // 1日 / 3日 / 5日 前との比較 (履歴は日次、ティックは秒〜分)
  const offsets = [1, 3, 5];
  const refs = offsets.map(n => series[Math.max(0, series.length - 1 - n)]?.usdjpy);
  const diffs = refs.map(r => last - r);
  const dirs = diffs.map(d => Math.sign(d));
  const agree = dirs.reduce((s, d) => s + d, 0) / dirs.length;
  const avgPct = diffs.reduce((s, d, i) => s + d / refs[i], 0) / diffs.length;
  const score = Math.max(-1, Math.min(1, avgPct / 0.005));
  const cls = score > 0.2 ? 'up' : score < -0.2 ? 'down' : 'flat';
  const arrow = agree > 0 ? '↑' : agree < 0 ? '↓' : '→';
  return {
    score,
    label: `${arrow} ${pct(avgPct)} (5日)`,
    cls,
  };
}

function signalFriClose(ticks, fri) {
  // 履歴がある場合: 引け値 vs 5日平均からの乖離 (週末の引けがどれだけ偏った位置か)
  if (state.history.length >= 5) {
    const last = state.history[state.history.length - 1].usdjpy;
    const recent = state.history.slice(-5).map(h => h.usdjpy);
    const ma = recent.reduce((s, x) => s + x, 0) / recent.length;
    const diff = last - ma;
    const pctDiff = diff / ma;
    const score = Math.max(-1, Math.min(1, pctDiff / 0.005));
    const cls = score > 0.2 ? 'up' : score < -0.2 ? 'down' : 'flat';
    return {
      score,
      label: `${sign(diff)}${diff.toFixed(3)} vs MA5 (${pct(pctDiff)})`,
      cls,
    };
  }
  // フォールバック: ティックベース
  if (!fri || !ticks.length) return { score: 0, label: '--', cls: 'flat' };
  const last = ticks[ticks.length - 1].usdjpy;
  const diff = last - fri.usdjpy;
  const pctDiff = diff / fri.usdjpy;
  const score = Math.max(-1, Math.min(1, pctDiff / 0.003));
  const cls = score > 0.2 ? 'up' : score < -0.2 ? 'down' : 'flat';
  return { score, label: `${sign(diff)}${diff.toFixed(3)} (${pct(pctDiff)})`, cls };
}

function signalDXY() {
  // 過去5営業日でUSDが対EUR/GBP/CHFでどう動いたか
  const series = combinedSeries();
  if (series.length < 4) return { score: 0, label: 'データ不足', cls: 'flat' };
  const last = series[series.length - 1];
  const ref = series[Math.max(0, series.length - 1 - 5)];
  // EURUSD↓, GBPUSD↓, USDCHF↑ → USD強
  const a = (ref.eurusd - last.eurusd) / ref.eurusd;
  const b = (ref.gbpusd - last.gbpusd) / ref.gbpusd;
  const c = (last.usdchf - ref.usdchf) / ref.usdchf;
  const arr = [a, b, c].filter(v => Number.isFinite(v));
  if (!arr.length) return { score: 0, label: '--', cls: 'flat' };
  const avg = arr.reduce((s, x) => s + x, 0) / arr.length;
  const score = Math.max(-1, Math.min(1, avg / 0.005));
  const cls = score > 0.2 ? 'up' : score < -0.2 ? 'down' : 'flat';
  return { score, label: `USD ${pct(avg)} (5日)`, cls };
}

function signalJpyCross() {
  const series = combinedSeries();
  if (series.length < 4) return { score: 0, label: 'データ不足', cls: 'flat' };
  const last = series[series.length - 1];
  const ref = series[Math.max(0, series.length - 1 - 5)];
  const a = (last.eurjpy - ref.eurjpy) / ref.eurjpy;
  const b = (last.gbpjpy - ref.gbpjpy) / ref.gbpjpy;
  const arr = [a, b].filter(v => Number.isFinite(v));
  if (!arr.length) return { score: 0, label: '--', cls: 'flat' };
  const avg = arr.reduce((s, x) => s + x, 0) / arr.length;
  const score = Math.max(-1, Math.min(1, avg / 0.005));
  const cls = score > 0.2 ? 'up' : score < -0.2 ? 'down' : 'flat';
  return { score, label: `JPYクロス ${pct(avg)} (5日)`, cls };
}

function signalVol() {
  // 履歴から日次変動率を計算
  const xs = state.history.map(h => h.usdjpy).filter(Number.isFinite);
  if (xs.length < 3) return { score: 0, label: 'データ不足', cls: 'flat' };
  const rets = [];
  for (let i = 1; i < xs.length; i++) rets.push((xs[i] - xs[i-1]) / xs[i-1]);
  const sd = stdev(rets);
  const range = Math.max(...xs) - Math.min(...xs);
  return {
    score: 0,
    label: `日次σ=${(sd*100).toFixed(2)}% / R=${fmt(range,3)}`,
    cls: 'flat',
    sd, range,
  };
}

function signalWeekendBias(ticks, fri, momentum, friSig) {
  // 残存ポジション偏り推定:
  // 金曜引け前後のモメンタムがクローズ間際まで一方向だった場合、
  // 週末に反対側へリバランスが入りやすい (簡易ヒューリスティック)。
  if (!fri) return { score: 0, label: '--', cls: 'flat' };
  // 金曜引け方向と現在方向が逆 = リバランス進行 → トレンド継続シグナル弱まる
  const align = Math.sign(momentum.score) * Math.sign(friSig.score);
  let s = 0;
  let label = '中立';
  if (friSig.score > 0.5 && momentum.score < -0.2) { s = -0.3; label = '円高巻き戻し'; }
  else if (friSig.score < -0.5 && momentum.score > 0.2) { s = 0.3; label = '円安巻き戻し'; }
  else if (align > 0 && Math.abs(friSig.score) > 0.3) { s = friSig.score * 0.4; label = '継続バイアス'; }
  const cls = s > 0.1 ? 'up' : s < -0.1 ? 'down' : 'flat';
  return { score: s, label, cls };
}

// --- 統合判定 ---
function aggregate(signals, vol) {
  // 重み: モメンタム0.25, 引け乖離0.25, USD強弱0.20, 円クロス0.20, バイアス0.10
  const w = { momentum: 0.25, friclose: 0.25, dxy: 0.20, jpy: 0.20, bias: 0.10 };
  const raw =
      signals.momentum.score * w.momentum
    + signals.friclose.score * w.friclose
    + signals.dxy.score      * w.dxy
    + signals.jpy.score      * w.jpy
    + signals.bias.score     * w.bias;

  // ボラ大 → 確信度減衰
  let conf = Math.abs(raw);
  if (vol?.sd) {
    const damp = Math.min(1, 0.0005 / vol.sd);
    conf *= (0.5 + 0.5 * damp);
  }
  conf = Math.max(0, Math.min(1, conf));

  let dir = 'FLAT (レンジ)';
  let cls = 'flat';
  if (raw > 0.15) { dir = '円安方向 (USDJPY ↑)'; cls = 'up'; }
  else if (raw < -0.15) { dir = '円高方向 (USDJPY ↓)'; cls = 'down'; }

  return { raw, conf, dir, cls };
}

// --- 描画 ---
function render() {
  if (!state.ticks.length) return;
  const t = state.ticks[state.ticks.length - 1];
  $('usdjpy').textContent = fmt(t.usdjpy, 3);

  // 金曜引け差
  if (state.fridayClose) {
    const d = t.usdjpy - state.fridayClose.usdjpy;
    const el = $('delta-fri');
    el.textContent = `vs 金曜引け: ${sign(d)}${d.toFixed(3)} (${pct(d/state.fridayClose.usdjpy)})`;
    el.className = d > 0 ? 'up' : d < 0 ? 'down' : '';
  }
  // 1H差
  const oneHourAgo = state.ticks.find(x => Date.now() - x.t <= 60*60*1000) || state.ticks[0];
  const d1 = t.usdjpy - oneHourAgo.usdjpy;
  $('delta-1h').textContent = `1H: ${sign(d1)}${d1.toFixed(3)}`;

  // シグナル
  const sigs = {
    momentum: signalMomentum(),
    friclose: signalFriClose(state.ticks, state.fridayClose),
    dxy:      signalDXY(),
    jpy:      signalJpyCross(),
  };
  const vol = signalVol();
  sigs.bias = signalWeekendBias(state.ticks, state.fridayClose, sigs.momentum, sigs.friclose);

  paintSignal('sig-momentum', sigs.momentum);
  paintSignal('sig-friclose', sigs.friclose);
  paintSignal('sig-dxy',      sigs.dxy);
  paintSignal('sig-jpy',      sigs.jpy);
  paintSignal('sig-vol',      vol);
  paintSignal('sig-bias',     sigs.bias);

  // 統合
  const agg = aggregate(sigs, vol);
  const card = $('verdict');
  card.classList.remove('up','down','flat');
  card.classList.add(agg.cls);
  $('dir').textContent = agg.dir;
  $('conf').textContent = `${(agg.conf*100).toFixed(0)}%`;

  // 想定レンジ (ボラベース)
  if (vol.sd) {
    const k = 1.5 + 1.5 * agg.conf;
    const center = t.usdjpy + (agg.raw * vol.sd * 3); // 方向に少し寄せる
    const lo = center - k * vol.sd;
    const hi = center + k * vol.sd;
    $('target-range').textContent = `${fmt(lo,3)} 〜 ${fmt(hi,3)}`;
  }

  // 方向遷移ログ
  if (state.lastDirection !== agg.cls) {
    logEvent(`判定: <b>${agg.dir}</b> 確信度 ${(agg.conf*100).toFixed(0)}% (raw=${agg.raw.toFixed(3)})`);
    state.lastDirection = agg.cls;
  }

  // チャート
  drawChart();

  // ステータス
  const ms = marketState();
  const badge = $('market-state');
  badge.textContent = ms === 'open' ? 'MARKET OPEN' : 'MARKET CLOSED (週末)';
  badge.className = `badge ${ms}`;
  $('last-update').textContent = `最終更新: ${new Date().toLocaleString('ja-JP')}`;
}

function paintSignal(id, sig) {
  const el = $(id);
  el.classList.remove('up','down','flat');
  el.classList.add(sig.cls || 'flat');
  el.querySelector('.v').textContent = sig.label;
}

function drawChart() {
  const c = $('chart');
  const ctx = c.getContext('2d');
  const w = c.width = c.clientWidth * devicePixelRatio;
  const h = c.height = 280 * devicePixelRatio;
  ctx.scale(1,1);
  ctx.clearRect(0,0,w,h);
  const series = combinedSeries();
  const xs = series.map(t => t.usdjpy).filter(Number.isFinite);
  if (!xs.length) return;
  const histLen = state.history.length;
  const min = Math.min(...xs, state.fridayClose?.usdjpy ?? Infinity);
  const max = Math.max(...xs, state.fridayClose?.usdjpy ?? -Infinity);
  const pad = (max - min) * 0.1 || 0.05;
  const lo = min - pad, hi = max + pad;
  const x = (i) => (i / Math.max(1, xs.length - 1)) * (w - 40) + 30;
  const y = (v) => h - 20 - ((v - lo) / (hi - lo)) * (h - 40);

  // grid
  ctx.strokeStyle = '#232a3a'; ctx.lineWidth = 1;
  for (let g = 0; g < 5; g++) {
    const yy = 10 + g * (h - 30) / 4;
    ctx.beginPath(); ctx.moveTo(30, yy); ctx.lineTo(w - 10, yy); ctx.stroke();
  }

  // 金曜引けライン
  if (state.fridayClose) {
    const yy = y(state.fridayClose.usdjpy);
    ctx.strokeStyle = '#8a93a6'; ctx.setLineDash([4*devicePixelRatio, 4*devicePixelRatio]);
    ctx.beginPath(); ctx.moveTo(30, yy); ctx.lineTo(w-10, yy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#8a93a6'; ctx.font = `${10*devicePixelRatio}px sans-serif`;
    ctx.fillText(`Fri close ${state.fridayClose.usdjpy.toFixed(3)}`, w - 130*devicePixelRatio, yy - 4);
  }

  // ライン
  ctx.strokeStyle = '#6ea8fe'; ctx.lineWidth = 2 * devicePixelRatio;
  ctx.beginPath();
  xs.forEach((v, i) => {
    if (i === 0) ctx.moveTo(x(i), y(v));
    else ctx.lineTo(x(i), y(v));
  });
  ctx.stroke();

  // 最終ドット
  const lastI = xs.length - 1;
  ctx.fillStyle = '#6ea8fe';
  ctx.beginPath(); ctx.arc(x(lastI), y(xs[lastI]), 4*devicePixelRatio, 0, Math.PI*2); ctx.fill();

  // y軸ラベル
  ctx.fillStyle = '#8a93a6'; ctx.font = `${10*devicePixelRatio}px sans-serif`;
  ctx.fillText(hi.toFixed(3), 2, 14);
  ctx.fillText(lo.toFixed(3), 2, h - 24);
}

// --- メインループ ---
async function tick() {
  try {
    const t = await fetchSpot();
    state.ticks.push(t);
    if (state.ticks.length > HISTORY_MAX) state.ticks.shift();
    if (!state.fridayClose) {
      state.fridayClose = {
        usdjpy: t.usdjpy, eurusd: t.eurusd, gbpusd: t.gbpusd, usdchf: t.usdchf,
      };
      logEvent(`基準値セット: USDJPY=${fmt(t.usdjpy,3)} (source: ${t._src || '?'})`);
    }
    render();
  } catch (e) {
    logEvent(`取得失敗: ${e.message || e} — ブラウザのコンソール (F12) で詳細確認可`);
    console.error('[claudefinance] fetch failed', e);
  }
}

async function main() {
  logEvent(`起動: ClaudeFinance — 対象週末 ${TARGET_WEEKEND.join(' / ')}`);
  await fetchHistory();
  await tick();
  setInterval(tick, REFRESH_MS);
  window.addEventListener('resize', drawChart);
}

main();

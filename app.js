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

// --- データ取得 ---
// exchangerate.host: USDベースで複数通貨を一括取得 (CORS可、APIキー不要)
async function fetchSpot() {
  const url = 'https://api.exchangerate.host/latest?base=USD&symbols=JPY,EUR,GBP,CHF';
  const res = await fetch(url);
  if (!res.ok) throw new Error('rate fetch failed');
  const j = await res.json();
  const r = j.rates || {};
  // EURUSD等への変換
  const usdjpy = r.JPY;
  const usdeur = r.EUR; const eurusd = usdeur ? 1 / usdeur : null;
  const usdgbp = r.GBP; const gbpusd = usdgbp ? 1 / usdgbp : null;
  const usdchf = r.CHF;
  const eurjpy = (eurusd && usdjpy) ? eurusd * usdjpy : null;
  const gbpjpy = (gbpusd && usdjpy) ? gbpusd * usdjpy : null;
  return { t: Date.now(), usdjpy, eurusd, gbpusd, usdchf, eurjpy, gbpjpy };
}

// 直近金曜の引け値を時系列APIから取得
async function fetchFridayClose() {
  // 2026-05-08 (金) の引けに相当する終値
  const url = 'https://api.exchangerate.host/2026-05-08?base=USD&symbols=JPY,EUR,GBP,CHF';
  try {
    const res = await fetch(url);
    if (!res.ok) throw 0;
    const j = await res.json();
    const usdjpy = j.rates?.JPY;
    if (usdjpy) {
      state.fridayClose = {
        usdjpy,
        eurusd: j.rates.EUR ? 1/j.rates.EUR : null,
        gbpusd: j.rates.GBP ? 1/j.rates.GBP : null,
        usdchf: j.rates.CHF,
      };
      logEvent(`金曜引け取得: USDJPY=${fmt(usdjpy,3)}`);
    }
  } catch (e) {
    logEvent('金曜引け取得失敗 → 初回ティックを基準にします');
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

// 各シグナルは [-1, +1] のスコアを返す。+ = 円安 (USDJPY上), - = 円高 (USDJPY下)
function signalMomentum(ticks) {
  if (ticks.length < 6) return { score: 0, label: '--', cls: 'flat' };
  const last = ticks[ticks.length - 1].usdjpy;
  // 5 / 15 / 60 ティック前との比較
  const refs = [5, 15, 60].map(n => ticks[Math.max(0, ticks.length - 1 - n)]?.usdjpy);
  const dirs = refs.map(r => Math.sign((last - r) || 0));
  const agree = dirs.reduce((s, d) => s + d, 0) / dirs.length;
  const cls = agree > 0.3 ? 'up' : agree < -0.3 ? 'down' : 'flat';
  return {
    score: Math.max(-1, Math.min(1, agree)),
    label: agree > 0 ? `↑ +${(agree*100).toFixed(0)}%一致` :
           agree < 0 ? `↓ ${(agree*100).toFixed(0)}%一致` : '中立',
    cls,
  };
}

function signalFriClose(ticks, fri) {
  if (!fri || !ticks.length) return { score: 0, label: '--', cls: 'flat' };
  const last = ticks[ticks.length - 1].usdjpy;
  const diff = last - fri.usdjpy;
  const pctDiff = diff / fri.usdjpy;
  // 0.3% を 1.0スコアに正規化
  const score = Math.max(-1, Math.min(1, pctDiff / 0.003));
  const cls = score > 0.2 ? 'up' : score < -0.2 ? 'down' : 'flat';
  return {
    score,
    label: `${sign(diff)}${diff.toFixed(3)} (${pct(pctDiff)})`,
    cls,
  };
}

function signalDXY(ticks, fri) {
  // USDが他通貨に対して強い → USDJPY上 (円安)
  if (!fri || ticks.length < 2) return { score: 0, label: '--', cls: 'flat' };
  const t = ticks[ticks.length - 1];
  // EURUSD↓, GBPUSD↓, USDCHF↑ なら USD強
  const a = pctChange(fri.eurusd, t.eurusd);  // 反転: EURUSD下落 → 値は正
  const b = pctChange(fri.gbpusd, t.gbpusd);
  const c = pctChange(t.usdchf, fri.usdchf);
  const arr = [a, b, c].filter(v => v != null);
  if (!arr.length) return { score: 0, label: '--', cls: 'flat' };
  const avg = arr.reduce((s, x) => s + x, 0) / arr.length;
  const score = Math.max(-1, Math.min(1, avg / 0.003));
  const cls = score > 0.2 ? 'up' : score < -0.2 ? 'down' : 'flat';
  return { score, label: `USD ${pct(avg)}`, cls };
}

function signalJpyCross(ticks, fri) {
  // EURJPY/GBPJPYが上 → 円全面安 → USDJPY上の整合
  if (!fri || ticks.length < 2) return { score: 0, label: '--', cls: 'flat' };
  const t = ticks[ticks.length - 1];
  const friEurJpy = fri.eurusd * fri.usdjpy;
  const friGbpJpy = fri.gbpusd * fri.usdjpy;
  const a = pctChange(t.eurjpy, friEurJpy);
  const b = pctChange(t.gbpjpy, friGbpJpy);
  const arr = [a, b].filter(v => v != null);
  if (!arr.length) return { score: 0, label: '--', cls: 'flat' };
  const avg = arr.reduce((s, x) => s + x, 0) / arr.length;
  const score = Math.max(-1, Math.min(1, avg / 0.003));
  const cls = score > 0.2 ? 'up' : score < -0.2 ? 'down' : 'flat';
  return { score, label: `JPYクロス ${pct(avg)}`, cls };
}

function signalVol(ticks) {
  const xs = rolling(ticks, 120, 'usdjpy');
  if (!xs || xs.length < 5) return { score: 0, label: '--', cls: 'flat' };
  const sd = stdev(xs);
  const range = Math.max(...xs) - Math.min(...xs);
  return {
    score: 0, // ボラ自体は方向に寄与させない、確信度の重みづけに使う
    label: `σ=${fmt(sd, 4)} / R=${fmt(range,3)}`,
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
    momentum: signalMomentum(state.ticks),
    friclose: signalFriClose(state.ticks, state.fridayClose),
    dxy:      signalDXY(state.ticks, state.fridayClose),
    jpy:      signalJpyCross(state.ticks, state.fridayClose),
  };
  const vol = signalVol(state.ticks);
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
  const xs = state.ticks.map(t => t.usdjpy);
  if (!xs.length) return;
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
    render();
  } catch (e) {
    logEvent(`取得失敗: ${e.message || e}`);
  }
}

async function main() {
  logEvent(`起動: ClaudeFinance — 対象週末 ${TARGET_WEEKEND.join(' / ')}`);
  await fetchFridayClose();
  await tick();
  setInterval(tick, REFRESH_MS);
  window.addEventListener('resize', drawChart);
}

main();

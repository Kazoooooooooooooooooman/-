// スマートウォーク プロトタイプ
// GPS到着判定のロジック検証用。iOSアプリの LocationManager に相当する部分を
// ブラウザの Geolocation API で再現している。

const SPOTS = [
  { id: "shibuya",  name: "サンプルスーパー渋谷店",  lat: 35.6595, lng: 139.7005, radius: 80, sponsored: true },
  { id: "shinjuku", name: "サンプルスーパー新宿店",  lat: 35.6896, lng: 139.7006, radius: 80, sponsored: false },
  { id: "tokyo",    name: "サンプルスーパー東京駅店", lat: 35.6812, lng: 139.7671, radius: 80, sponsored: false },
];

const LOCKED_APPS = [
  { name: "SNS", icon: "💬", color: "#34aadc" },
  { name: "動画", icon: "▶️", color: "#ff3b30" },
  { name: "ゲーム", icon: "🎮", color: "#5856d6" },
  { name: "ニュース", icon: "📰", color: "#ff9500" },
];

const state = {
  selectedSpot: null,
  locked: true,
  watchId: null,
};

// --- 距離計算（Haversine） -------------------------------------------------
function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// --- ロック状態の適用（iOS の RestrictionManager 相当） ---------------------
function applyLockState(locked) {
  if (state.locked === locked) return;
  state.locked = locked;
  render();
}

function evaluatePosition(pos) {
  if (!state.selectedSpot) return;
  const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  const dist = distanceMeters(here, state.selectedSpot);
  document.getElementById("distance").textContent =
    `距離: 約 ${Math.round(dist)} m`;
  // ジオフェンス: 半径内なら解除、外なら再ロック
  applyLockState(dist > state.selectedSpot.radius);
}

// --- 位置追跡 --------------------------------------------------------------
function startTracking() {
  if (!navigator.geolocation) {
    alert("この端末/ブラウザは位置情報に対応していません。");
    return;
  }
  if (!state.selectedSpot) {
    alert("先に解除スポットを選んでください。");
    return;
  }
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = navigator.geolocation.watchPosition(
    evaluatePosition,
    (err) => {
      document.getElementById("distance").textContent =
        `位置情報エラー: ${err.message}`;
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
  document.getElementById("trackBtn").textContent = "追跡中…";
}

// --- 描画 ------------------------------------------------------------------
function render() {
  const card = document.getElementById("statusCard");
  const icon = document.getElementById("statusIcon");
  const text = document.getElementById("statusText");
  const detail = document.getElementById("statusDetail");

  if (state.locked) {
    card.classList.remove("unlocked");
    icon.textContent = "🔒";
    text.textContent = "ロック中";
    detail.textContent = state.selectedSpot
      ? `「${state.selectedSpot.name}」へ向かってください`
      : "解除スポットを選んでください";
  } else {
    card.classList.add("unlocked");
    icon.textContent = "🔓";
    text.textContent = "解除中";
    detail.textContent = "到着しました。アプリを使えます。";
  }

  document.querySelectorAll(".app").forEach((el) => {
    el.classList.toggle("locked", state.locked);
  });

  document.querySelectorAll(".spot").forEach((el) => {
    el.classList.toggle(
      "selected",
      el.dataset.id === state.selectedSpot?.id
    );
  });
}

function renderSpots() {
  const list = document.getElementById("spotList");
  list.innerHTML = "";
  SPOTS.forEach((spot) => {
    const div = document.createElement("div");
    div.className = "spot";
    div.dataset.id = spot.id;
    div.innerHTML = `
      <span class="name">${spot.name}${
        spot.sponsored ? '<span class="pr-tag">PR</span>' : ""
      }</span>
      <span>›</span>`;
    div.addEventListener("click", () => {
      state.selectedSpot = spot;
      render();
    });
    list.appendChild(div);
  });
}

function renderApps() {
  const grid = document.getElementById("appGrid");
  grid.innerHTML = "";
  LOCKED_APPS.forEach((app) => {
    const div = document.createElement("div");
    div.className = "app locked";
    div.innerHTML = `
      <div class="icon" style="background:${app.color}">${app.icon}</div>
      ${app.name}`;
    div.addEventListener("click", () => {
      if (state.locked) showShield();
    });
    grid.appendChild(div);
  });
}

// --- シールド画面（ロック中アプリを開いたとき） ------------------------------
function showShield() {
  document.getElementById("shieldMsg").textContent = state.selectedSpot
    ? `「${state.selectedSpot.name}」に着くとロックが外れます`
    : "解除スポットを選んでください";
  document.getElementById("shield").hidden = false;
}

// --- 初期化 ----------------------------------------------------------------
function init() {
  renderSpots();
  renderApps();
  render();
  document.getElementById("trackBtn").addEventListener("click", startTracking);
  document.getElementById("simArrive").addEventListener("click", () =>
    applyLockState(false)
  );
  document.getElementById("simLeave").addEventListener("click", () =>
    applyLockState(true)
  );
  document.getElementById("shieldClose").addEventListener("click", () => {
    document.getElementById("shield").hidden = true;
  });
}

init();

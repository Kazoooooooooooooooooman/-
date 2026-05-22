// スマートウォーク プロトタイプ
// GPS到着判定 + 滞在判定のロジック検証用。iOSアプリの LocationManager /
// AppModel に相当する部分を、ブラウザの Geolocation API で再現している。

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

// 解除に必要な連続滞在秒数（実機と同じ3分）。
const DWELL_SECONDS = 180;

const state = {
  selectedSpot: null,
  phase: "locked", // "locked" | "dwelling" | "unlocked"
  watchId: null,
  dwellRemaining: 0,
  dwellInterval: null,
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

// --- 滞在判定（iOS の AppModel.startDwell 相当） ----------------------------
// スポット圏内に入ると滞在カウント開始。連続 DWELL_SECONDS 滞在で解除。
// 途中で圏外に出るとリセットして再ロック。
function onRegionChange(isInside) {
  if (isInside) {
    startDwell();
  } else {
    cancelDwell();
    setPhase("locked");
  }
}

function startDwell() {
  if (state.phase !== "locked") return; // 既に滞在中/解除中なら何もしない
  setPhase("dwelling");
  state.dwellRemaining = DWELL_SECONDS;
  state.dwellInterval = setInterval(tickDwell, 1000);
  render();
}

function tickDwell() {
  state.dwellRemaining -= 1;
  if (state.dwellRemaining <= 0) {
    clearInterval(state.dwellInterval);
    state.dwellInterval = null;
    setPhase("unlocked");
  }
  render();
}

function cancelDwell() {
  if (state.dwellInterval) {
    clearInterval(state.dwellInterval);
    state.dwellInterval = null;
  }
  state.dwellRemaining = 0;
}

function setPhase(phase) {
  state.phase = phase;
  render();
}

// --- 位置評価（iOS の LocationManager 相当） -------------------------------
function evaluatePosition(pos) {
  if (!state.selectedSpot) return;
  const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  const dist = distanceMeters(here, state.selectedSpot);
  document.getElementById("distance").textContent =
    `距離: 約 ${Math.round(dist)} m`;
  onRegionChange(dist <= state.selectedSpot.radius);
}

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

// --- 表示 ------------------------------------------------------------------
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function render() {
  const card = document.getElementById("statusCard");
  const icon = document.getElementById("statusIcon");
  const text = document.getElementById("statusText");
  const detail = document.getElementById("statusDetail");

  card.classList.remove("unlocked", "dwelling");

  if (state.phase === "locked") {
    icon.textContent = "🔒";
    text.textContent = "ロック中";
    detail.textContent = state.selectedSpot
      ? `「${state.selectedSpot.name}」へ向かってください`
      : "解除スポットを選んでください";
  } else if (state.phase === "dwelling") {
    card.classList.add("dwelling");
    icon.textContent = "⏳";
    text.textContent = "滞在中";
    detail.textContent =
      `解除まで ${formatTime(state.dwellRemaining)}（スポットを出るとリセット）`;
  } else {
    card.classList.add("unlocked");
    icon.textContent = "🔓";
    text.textContent = "解除中";
    detail.textContent = "到着確認。アプリを使えます。";
  }

  const locked = state.phase !== "unlocked";
  document.querySelectorAll(".app").forEach((el) => {
    el.classList.toggle("locked", locked);
  });
  document.querySelectorAll(".spot").forEach((el) => {
    el.classList.toggle("selected", el.dataset.id === state.selectedSpot?.id);
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
      cancelDwell();
      setPhase("locked");
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
      if (state.phase !== "unlocked") showShield();
    });
    grid.appendChild(div);
  });
}

function showShield() {
  let msg = "解除スポットを選んでください";
  if (state.selectedSpot) {
    msg =
      state.phase === "dwelling"
        ? `滞在中。あと ${formatTime(state.dwellRemaining)} でロックが外れます`
        : `「${state.selectedSpot.name}」に着いて3分滞在するとロックが外れます`;
  }
  document.getElementById("shieldMsg").textContent = msg;
  document.getElementById("shield").hidden = false;
}

function init() {
  renderSpots();
  renderApps();
  render();
  document.getElementById("trackBtn").addEventListener("click", startTracking);
  document.getElementById("simArrive").addEventListener("click", () =>
    onRegionChange(true)
  );
  document.getElementById("simLeave").addEventListener("click", () =>
    onRegionChange(false)
  );
  document.getElementById("shieldClose").addEventListener("click", () => {
    document.getElementById("shield").hidden = true;
  });
}

init();

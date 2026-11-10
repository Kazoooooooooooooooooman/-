// 1枚目の Soto Phone を3Dで見せる。指やマウスで左右に回すと360度、裏側まで見える。
// ・画面は有機EL（黒い背景に、白く光る文字）。時計と、電話・地図・乗換・カメラ・Soto Map・Soto Pass
// ・スマホでは、縦のスクロールを邪魔しない（横に動かしたときだけ回る）
// ・WebGL が使えない、動きを減らす設定のとき、画面の外にあるときは、写真のまま／止めておく
import * as THREE from "/vendor/three/three.module.min.js";
import { RoundedBoxGeometry } from "/vendor/three/RoundedBoxGeometry.js";
import { RoomEnvironment } from "/vendor/three/RoomEnvironment.js";

const host = document.querySelector("[data-phone3d]");
if (host) start(host).catch(() => { /* 写真のまま見せる */ });

async function start(host) {
  const lang = host.dataset.lang === "en" ? "en" : "ja";
  const canvas = document.createElement("canvas");
  canvas.className = "p3d-canvas";
  canvas.setAttribute("aria-hidden", "true");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  } catch (_) { return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  camera.position.set(0, 0, 5.2);

  // ---------- 本体 ----------
  // 正方形。幅・高さ 71mm、厚さ 8mm くらいの比率（1 = 71mm）
  const W = 1, H = 1, D = 0.095, R = 0.135;
  const phone = new THREE.Group();
  scene.add(phone);

  // 外枠：つや消しのグラファイト色の金属
  const frameMat = new THREE.MeshPhysicalMaterial({ color: 0x2a2a2d, metalness: 0.92, roughness: 0.34, clearcoat: 0.2, clearcoatRoughness: 0.5 });
  // 角を丸めた正方形を押し出し、ふちだけ細く面取りする（前後の面が端まで平らになる）
  const B = 0.016;
  const outline = squircle(W - 2 * B, H - 2 * B, 7);
  const bodyGeo = new THREE.ExtrudeGeometry(outline, { depth: D - 2 * B, bevelEnabled: true, bevelThickness: B, bevelSize: B, bevelSegments: 8, curveSegments: 1 });
  bodyGeo.translate(0, 0, -(D - 2 * B) / 2);
  const body = new THREE.Mesh(bodyGeo, frameMat);
  phone.add(body);

  // 前面：一枚の黒いガラス。画面のまわりのふちは細く、上下左右で同じ幅
  const front = new THREE.Mesh(
    squirclePlane(W - 2 * B - 0.004, H - 2 * B - 0.004, 7),
    new THREE.MeshPhysicalMaterial({ color: 0x050506, metalness: 0, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04 })
  );
  front.position.z = D / 2 + 0.0008;
  phone.add(front);

  // 画面（有機EL）：正方形
  const SCR = 0.87;
  const screenTex = new THREE.CanvasTexture(drawScreen(lang));
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const screen = new THREE.Mesh(squirclePlane(SCR, SCR, 9), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.z = D / 2 + 0.0016;
  phone.add(screen);
  // 画面の上のガラスの映り込み
  const glare = new THREE.Mesh(
    squirclePlane(W - 2 * B - 0.004, H - 2 * B - 0.004, 7),
    new THREE.MeshPhysicalMaterial({ color: 0x000000, transparent: true, opacity: 0.12, roughness: 0.02, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 })
  );
  glare.position.z = D / 2 + 0.0024;
  phone.add(glare);

  // 右側面のボタン：細く、ほとんど出っ張らない
  const btnMat = new THREE.MeshPhysicalMaterial({ color: 0x34343a, metalness: 0.95, roughness: 0.25 });
  [[0.17, 0.16], [-0.06, 0.1]].forEach(([y, h]) => {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.012, h, 0.036, 3, 0.005), btnMat);
    b.position.set(W / 2 + 0.002, y, 0);
    phone.add(b);
  });

  // 裏面：つや消しの黒いガラスに、小さなロゴと丸いカメラ
  const backTex = new THREE.CanvasTexture(drawBack());
  backTex.colorSpace = THREE.SRGBColorSpace;
  const back = new THREE.Mesh(
    squirclePlane(W - 2 * B - 0.004, H - 2 * B - 0.004, 7),
    new THREE.MeshPhysicalMaterial({ map: backTex, color: 0xffffff, metalness: 0.1, roughness: 0.62, clearcoat: 0.3, clearcoatRoughness: 0.6 })
  );
  back.position.z = -D / 2 - 0.0008;
  back.rotation.y = Math.PI;
  phone.add(back);
  const lensRing = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.012, 64), new THREE.MeshPhysicalMaterial({ color: 0x3a3a3f, metalness: 0.95, roughness: 0.22 }));
  lensRing.rotation.x = Math.PI / 2;
  lensRing.position.set(W / 2 - 0.15, H / 2 - 0.15, -D / 2 - 0.004);
  phone.add(lensRing);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.014, 64), new THREE.MeshPhysicalMaterial({ color: 0x020305, metalness: 0.3, roughness: 0.03, clearcoat: 1 }));
  lens.rotation.x = Math.PI / 2;
  lens.position.copy(lensRing.position).add(new THREE.Vector3(0, 0, -0.002));
  phone.add(lens);

  // 光：左上からのやわらかい光と、ふちを光らせる逆光
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x2a2622, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd7b0, 1.2); rim.position.set(3, 1, -3); scene.add(rim);

  // 床に落ちる影（やわらかい楕円）
  const shadowTex = new THREE.CanvasTexture(drawShadow());
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.36), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.position.set(0, -H / 2 - 0.2, -0.1);
  shadow.rotation.x = -Math.PI / 2.4;
  scene.add(shadow);

  // ---------- 置き場所 ----------
  host.appendChild(canvas);
  const size = () => {
    // CSS で枠より大きく広げているので、canvas そのものの大きさで描く（伸び縮みさせない）
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 縦長の枠でも横長の枠でも、携帯がちょうど収まる距離にする
    camera.position.z = camera.aspect < 0.85 ? 3.7 / camera.aspect * 0.85 : 3.7;
    camera.updateProjectionMatrix();
  };
  size();
  new ResizeObserver(size).observe(canvas);

  // ---------- 回す ----------
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let rotY = -0.45, rotX = 0.02, velY = 0, dragging = false, lastX = 0, lastY = 0, idleAt = 0;
  const startY = performance.now();
  canvas.style.touchAction = "pan-y";
  canvas.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; velY = 0; canvas.setPointerCapture(e.pointerId); host.classList.add("is-grab"); });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    velY = dx * 0.012;
    rotY += velY;
    if (e.pointerType === "mouse") rotX = Math.max(-0.5, Math.min(0.5, rotX + dy * 0.006));
    wake();
  });
  const end = () => { dragging = false; idleAt = performance.now(); host.classList.remove("is-grab"); host.classList.add("is-used"); };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  // 画面の外にあるとき、タブを見ていないときは止める
  let visible = true, running = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); }).observe(host);
  document.addEventListener("visibilitychange", wake);
  function wake() { if (!running && visible && !document.hidden) { running = true; requestAnimationFrame(loop); } }

  let t0 = performance.now();
  function loop(now) {
    if (!visible || document.hidden) { running = false; return; }
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    if (!dragging) {
      // 手を離したあとは惰性で少し回り、そのあとゆっくり自転する
      velY *= 0.94;
      rotY += velY;
      if (!reduce && now - idleAt > 1600) rotY += dt * 0.35;
      rotX += (0.02 - rotX) * 0.03;
    }
    // ふわっと浮いている
    const bob = reduce ? 0 : Math.sin((now - startY) / 1400) * 0.025;
    phone.rotation.set(rotX, rotY, 0);
    phone.position.y = bob + 0.03;
    shadow.material.opacity = 0.75 - bob * 4;
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  await (document.fonts ? document.fonts.ready : Promise.resolve());
  screenTex.image = drawScreen(lang); screenTex.needsUpdate = true;
  host.classList.add("is-3d");
  // 「回せます」と一度だけ伝え、触ったら消す
  const note = host.querySelector(".hd-note");
  if (note && host.dataset.hint) {
    const base = note.textContent;
    note.textContent = base + " ・ " + host.dataset.hint;
    canvas.addEventListener("pointerdown", () => { note.textContent = base; }, { once: true });
  }
  wake();
}

// ---------- 画面の絵（有機EL） ----------
// 黒い背景に白い文字。時計を大きく、その下に6つの道具を2列で
function drawScreen(lang) {
  const S = 1024, c = document.createElement("canvas");
  c.width = S; c.height = S;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, S, S);
  // 電池
  g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 4;
  roundRect(g, S - 132, 58, 62, 28, 7); g.stroke();
  g.fillStyle = "rgba(255,255,255,.7)"; roundRect(g, S - 125, 65, 38, 14, 3); g.fill(); g.fillRect(S - 66, 67, 5, 10);
  // 時計
  g.fillStyle = "#fff";
  g.font = '300 236px "Inter Tight", "Helvetica Neue", Arial, sans-serif';
  g.textAlign = "center"; g.textBaseline = "alphabetic";
  g.fillText("10:24", S / 2, 372);
  // 区切りの細い線
  g.fillStyle = "rgba(255,255,255,.14)"; g.fillRect(104, 456, S - 208, 2);
  const items = lang === "en"
    ? [["phone", "Phone"], ["map", "Maps"], ["train", "Transit"], ["camera", "Camera"], ["soto-map", "Soto Map"], ["pass", "Soto Pass"]]
    : [["phone", "電話"], ["map", "地図"], ["train", "乗換"], ["camera", "カメラ"], ["soto-map", "Soto Map"], ["pass", "Soto Pass"]];
  const colX = [118, 548], rowY = [570, 710, 850];
  g.textAlign = "left"; g.textBaseline = "middle";
  items.forEach(([icon, label], i) => {
    const x = colX[i < 3 ? 0 : 1], y = rowY[i % 3];
    drawIcon(g, icon, x, y, 50);
    g.fillStyle = "rgba(255,255,255,.94)";
    g.font = /^[A-Za-z]/.test(label) ? '400 50px "Inter Tight", "Helvetica Neue", Arial, sans-serif' : '400 50px "Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", sans-serif';
    g.fillText(label, x + 76, y + 2);
  });
  return c;
}

function drawIcon(g, kind, x, y, s) {
  const cx = x + s / 2, cy = y;
  g.save();
  g.strokeStyle = "#fff"; g.fillStyle = "#fff"; g.lineWidth = s * 0.09; g.lineCap = "round"; g.lineJoin = "round";
  if (kind === "phone") {
    g.beginPath();
    g.moveTo(cx - s * 0.3, cy - s * 0.38);
    g.quadraticCurveTo(cx - s * 0.42, cy + s * 0.05, cx + s * 0.02, cy + s * 0.36);
    g.lineTo(cx + s * 0.32, cy + s * 0.22);
    g.lineTo(cx + s * 0.16, cy + s * 0.02);
    g.lineTo(cx + s * 0.02, cy + s * 0.1);
    g.quadraticCurveTo(cx - s * 0.12, cy, cx - s * 0.16, cy - s * 0.16);
    g.lineTo(cx - s * 0.06, cy - s * 0.28);
    g.lineTo(cx - s * 0.22, cy - s * 0.44);
    g.closePath(); g.fill();
  } else if (kind === "map") {
    g.beginPath(); g.arc(cx, cy - s * 0.1, s * 0.26, Math.PI, 0); g.lineTo(cx, cy + s * 0.42); g.closePath(); g.fill();
    g.fillStyle = "#000"; g.beginPath(); g.arc(cx, cy - s * 0.1, s * 0.1, 0, Math.PI * 2); g.fill();
  } else if (kind === "train") {
    roundRect(g, cx - s * 0.28, cy - s * 0.4, s * 0.56, s * 0.62, s * 0.12); g.fill();
    g.fillStyle = "#000"; g.fillRect(cx - s * 0.19, cy - s * 0.28, s * 0.38, s * 0.2);
    g.beginPath(); g.arc(cx - s * 0.13, cy + s * 0.08, s * 0.05, 0, Math.PI * 2); g.arc(cx + s * 0.13, cy + s * 0.08, s * 0.05, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#fff"; g.beginPath(); g.moveTo(cx - s * 0.16, cy + s * 0.28); g.lineTo(cx - s * 0.26, cy + s * 0.42); g.moveTo(cx + s * 0.16, cy + s * 0.28); g.lineTo(cx + s * 0.26, cy + s * 0.42); g.stroke();
  } else if (kind === "camera") {
    roundRect(g, cx - s * 0.4, cy - s * 0.24, s * 0.8, s * 0.56, s * 0.1); g.fill();
    g.fillRect(cx - s * 0.14, cy - s * 0.34, s * 0.28, s * 0.12);
    g.fillStyle = "#000"; g.beginPath(); g.arc(cx, cy + s * 0.04, s * 0.15, 0, Math.PI * 2); g.fill();
  } else if (kind === "soto-map") {
    // 灰色の点が並び、通ったところだけ赤い
    const pts = [[-0.36, 0.3], [-0.1, 0.12], [0.06, -0.12], [0.32, -0.3]];
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = s * 0.05;
    g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo : g.moveTo).call(g, cx + px * s, cy + py * s)); g.stroke();
    pts.forEach(([px, py], i) => {
      g.fillStyle = i < 2 ? "#ff5a36" : "rgba(255,255,255,.45)";
      g.beginPath(); g.arc(cx + px * s, cy + py * s, s * 0.1, 0, Math.PI * 2); g.fill();
    });
  } else if (kind === "pass") {
    const x0 = cx - s * 0.42, y0 = cy - s * 0.27, w = s * 0.84, h = s * 0.54;
    roundRect(g, x0, y0, w, h, s * 0.08); g.fill();
    g.fillStyle = "#000";
    g.beginPath(); g.arc(x0, cy, s * 0.1, 0, Math.PI * 2); g.arc(x0 + w, cy, s * 0.1, 0, Math.PI * 2); g.fill();
    g.setLineDash([s * 0.07, s * 0.07]); g.strokeStyle = "#000"; g.lineWidth = s * 0.05;
    g.beginPath(); g.moveTo(x0 + w * 0.62, y0 + s * 0.06); g.lineTo(x0 + w * 0.62, y0 + h - s * 0.06); g.stroke();
  }
  g.restore();
}

function drawBack() {
  const S = 1024, c = document.createElement("canvas");
  c.width = S; c.height = S;
  const g = c.getContext("2d");
  g.fillStyle = "#121214"; g.fillRect(0, 0, S, S);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "rgba(255,255,255,.34)";
  g.font = '400 92px "Shippori Mincho", "Hiragino Mincho ProN", serif';
  g.fillText("外", S / 2, S / 2 - 20);
  g.font = '500 26px "Inter Tight", "Helvetica Neue", Arial, sans-serif';
  g.fillStyle = "rgba(255,255,255,.26)";
  g.fillText("S O T O", S / 2, S / 2 + 62);
  return c;
}

function drawShadow() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 72;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(128, 36, 4, 128, 36, 120);
  gr.addColorStop(0, "rgba(40,30,20,.42)"); gr.addColorStop(1, "rgba(40,30,20,0)");
  g.fillStyle = gr; g.scale(1, 0.3); g.beginPath(); g.arc(128, 120, 120, 0, Math.PI * 2); g.fill();
  return c;
}


function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// 角が自然に続く正方形（スーパー楕円）。n が大きいほど四角に近い
function squircle(w, h, n, seg = 240) {
  const sh = new THREE.Shape();
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    const x = (w / 2) * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const y = (h / 2) * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  return sh;
}
function squirclePlane(w, h, n) {
  const geo = new THREE.ShapeGeometry(squircle(w, h, n));
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let k = 0; k < pos.count; k++) uv.setXY(k, (pos.getX(k) + w / 2) / w, (pos.getY(k) + h / 2) / h);
  return geo;
}

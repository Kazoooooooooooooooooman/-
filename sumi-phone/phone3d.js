// 1枚目の Soto Phone を3Dで見せる。指やマウスで左右に回すと360度、裏側まで見える。
// ・形は、Soto Phone のデザイン案の3Dモデル（models/soto-phone.glb）。仕上げはシルバー（ヘアラインのステンレス、鏡面のふち）
// ・画面はロック画面とホーム画面を、数秒ごとに切り替える
// ・スマホでは、縦のスクロールを邪魔しない（横に動かしたときだけ回る）
// ・WebGL が使えないときは、静止画のまま
import * as THREE from "/vendor/three/three.module.min.js";
import { GLTFLoader } from "/vendor/three/GLTFLoader.js";
import { MeshoptDecoder } from "/vendor/three/meshopt_decoder.module.js";
import { RoomEnvironment } from "/vendor/three/RoomEnvironment.js";

const host = document.querySelector("[data-phone3d]");
// ?debug3d を付けて開くと、3D の読み込みの様子を携帯の下に表示する（実機で原因を調べるため）
const DEBUG = /[?&]debug3d\b/.test(location.search);
const logs = [];
const log = (m) => {
  logs.push(Math.round(performance.now()) + "ms " + m);
  if (!DEBUG || !host) return;
  let pre = host.querySelector(".p3d-debug");
  if (!pre) { pre = document.createElement("pre"); pre.className = "p3d-debug"; host.appendChild(pre); }
  pre.textContent = logs.join("\n");
};
window.addEventListener("error", (e) => log("error: " + (e.message || e)));
window.addEventListener("unhandledrejection", (e) => log("rejection: " + (e.reason && (e.reason.message || e.reason))));
if (host) {
  log("UA " + navigator.userAgent);
  start(host).then((r) => log(r === false ? "stopped (no WebGL)" : "ok")).catch((e) => log("failed: " + (e && (e.stack || e.message) || e)));
}

async function start(host) {
  const canvas = document.createElement("canvas");
  canvas.className = "p3d-canvas";
  canvas.setAttribute("aria-hidden", "true");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  } catch (e) { log("WebGL renderer: " + e.message); return false; }
  log("WebGL" + (renderer.capabilities.isWebGL2 ? "2" : "1") + " ok");
  // シェーダーが端末で使えなかったときは、軽い材質に切り替える
  let shaderFailed = false;
  renderer.debug.onShaderError = (gl, program, vs, fs) => { shaderFailed = true; log("shader error: " + (gl.getProgramInfoLog(program) || "").slice(0, 300)); };
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  camera.position.set(0, 0, 5.2);

  // ---------- 本体（3Dモデルを読み込む） ----------
  const texLoader = new THREE.TextureLoader();
  // 画像は fetch で受け取ってから貼る（iPhone の Safari で直接読むと失敗することがあるため）。
  // 1枚読めなくても止めずに、その部分だけ画像なしで描く
  const loadTex = async (url, srgb = true) => {
    for (let i = 0; i < 2; i++) {
      try {
        const blob = await (await fetch(url, { credentials: "same-origin" })).blob();
        const obj = URL.createObjectURL(blob);
        const t = await texLoader.loadAsync(obj);
        URL.revokeObjectURL(obj);
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        log("texture ok " + url);
        return t;
      } catch (e) { log("texture failed " + url + " (" + (e && (e.message || e.type) || e) + ")"); }
    }
    return null;
  };
  // 圧縮した形を読む。読めない端末（WebAssembly が使えないなど）では、圧縮していない形を読む
  const loadModel = async () => {
    try {
      await MeshoptDecoder.ready;
      const g = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync("/models/soto-phone.glb?v=1");
      log("model ok (compressed)"); return g;
    } catch (e) {
      log("compressed model failed: " + (e && e.message) + " -> plain");
      const g = await new GLTFLoader().loadAsync("/models/soto-phone-plain.glb?v=1");
      log("model ok (plain)"); return g;
    }
  };
  const [gltf, lockTex, homeTex, hairTex, logoTex] = await Promise.all([
    loadModel(),
    loadTex("/images/phone/screen-lock.jpg"), loadTex("/images/phone/screen-home.jpg"),
    loadTex("/images/phone/hairline.webp"), loadTex("/images/phone/logo-dark.png"),
  ]);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  // シルバー：ヘアライン仕上げのステンレス。鏡面のふちとカメラリング
  const M = {
    body: phys({ color: 0xcbc7c0, metalness: 1, roughness: 0.26 }),
    back: phys({ color: hairTex ? 0xffffff : 0xcbc7c0, map: hairTex, metalness: 1, roughness: 0.24, anisotropy: 0.75 }),
    edge: phys({ color: 0xf4f3f0, metalness: 1, roughness: 0.03 }),
    button: phys({ color: 0xcbc7c0, metalness: 1, roughness: 0.26 }),
    ring: phys({ color: 0xf0efec, metalness: 1, roughness: 0.05 }),
    screw: phys({ color: 0xeeeeee, metalness: 1, roughness: 0.05 }),
    glass: phys({ color: 0x050506, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02 }),
    display: phys({ color: 0x080808, metalness: 0, roughness: 0.3 }),
    lens: phys({ color: 0x030305, metalness: 0.2, roughness: 0.03, clearcoat: 1, iridescence: 0.6, iridescenceIOR: 1.6 }),
    flash: phys({ color: 0xfff0cf, metalness: 0, roughness: 0.25, emissive: 0x332a18 }),
    black: phys({ color: 0x111111, metalness: 0, roughness: 0.6 }),
    ear: phys({ color: 0x0d0d0e, metalness: 0, roughness: 0.7 }),
    antenna: phys({ color: 0xb4b2ae, metalness: 0, roughness: 0.45, clearcoat: 0.3 }),
  };
  const model = gltf.scene;
  model.traverse((o) => {
    if (!o.isMesh) return;
    const m = M[(o.name || "").split("_")[0]];
    if (!m) return;
    if (!o.geometry.attributes.normal) m.flatShading = true; // 法線のない部品は、角を立てて見せる
    o.material = m;
  });
  // 画面（反射をおさえたガラス越しに、画面の絵が光る）
  const SW = 6.54, SR = 0.41;
  const screenMat = phys({ map: lockTex, emissiveMap: lockTex, emissive: lockTex ? 0xffffff : 0x000000, emissiveIntensity: 0.85,
    roughness: 0.4, clearcoat: 0.45, clearcoatRoughness: 0.28, metalness: 0, envMapIntensity: 0.4 });
  const scr = new THREE.Mesh(roundedPlane(SW, SW, SR), screenMat);
  scr.position.z = 0.7008;
  model.add(scr);
  // 背面のロゴ
  if (logoTex) {
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(3, 3),
    phys({ map: logoTex, transparent: true, roughness: 0.55, metalness: 0.3, depthWrite: false }));
  logo.rotation.y = Math.PI;
  logo.position.set(-1.7, 0.75, -0.0015);
  model.add(logo);
  }
  // 大きさをそろえる：幅を 1 にして、真ん中を原点に
  const box = new THREE.Box3().setFromObject(model);
  const ctr = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  const k = 1 / Math.max(sz.x, sz.y);
  model.position.copy(ctr).multiplyScalar(-k);
  model.scale.setScalar(k);
  const H = sz.y * k;
  const phone = new THREE.Group();
  phone.add(model);
  scene.add(phone);
  // 画面はボタンで切り替える（ロック画面／ホーム）
  const en = host.dataset.lang === "en";
  const PAGES = [{ tex: lockTex, src: "/images/phone/screen-lock.jpg", name: en ? "Lock screen" : "ロック画面" },
                 { tex: homeTex, src: "/images/phone/screen-home.jpg", name: en ? "Home" : "ホーム" }];
  let page = 0;
  const setPage = (i) => {
    page = i;
    const t = PAGES[i].tex;
    screenMat.map = t; screenMat.emissiveMap = t; screenMat.emissive.setHex(t ? 0xffffff : 0x000000); screenMat.needsUpdate = true;
    tabs.forEach((b, j) => b.setAttribute("aria-pressed", String(j === i)));
    wake();
  };
  // 画面の切り替えボタン（ロック画面／ホーム）
  const bar = document.createElement("div");
  bar.className = "p3d-pages";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", en ? "Screen" : "画面");
  const tabs = PAGES.map((pg, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = pg.name; b.setAttribute("aria-pressed", String(i === 0));
    b.addEventListener("click", () => setPage(i));
    bar.appendChild(b);
    return b;
  });
  const zoom = document.createElement("button");
  zoom.type = "button"; zoom.className = "p3d-zoom"; zoom.setAttribute("aria-label", en ? "View the screen up close" : "画面を大きく見る");
  zoom.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M12.6 12.6 17 17M8.5 6v5M6 8.5h5"/></svg>';
  zoom.addEventListener("click", () => openViewer());
  bar.appendChild(zoom);
  // 画面を大きく見る（アプリの見た目まで確かめられるように）
  function openViewer() {
    const ov = document.createElement("div");
    ov.className = "p3d-viewer";
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-label", en ? "Soto Phone screen" : "Soto Phone の画面");
    const img = document.createElement("img");
    img.alt = PAGES[page].name; img.src = PAGES[page].src; img.width = 1024; img.height = 1024;
    const vbar = document.createElement("div"); vbar.className = "p3d-pages";
    const vtabs = PAGES.map((pg, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = pg.name; b.setAttribute("aria-pressed", String(i === page));
      b.addEventListener("click", (e) => { e.stopPropagation(); setPage(i); img.src = pg.src; img.alt = pg.name; vtabs.forEach((x, j) => x.setAttribute("aria-pressed", String(j === i))); });
      vbar.appendChild(b); return b;
    });
    const close = document.createElement("button");
    close.type = "button"; close.className = "p3d-close"; close.setAttribute("aria-label", en ? "Close" : "閉じる"); close.textContent = "×";
    const box = document.createElement("div"); box.className = "p3d-viewer-box";
    box.append(img, vbar);
    ov.append(close, box);
    const shut = () => { ov.remove(); document.removeEventListener("keydown", onKey); zoom.focus(); };
    const onKey = (e) => { if (e.key === "Escape") shut(); };
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target === close) shut(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(ov);
    close.focus();
  }

  // 光：右上からのやわらかい光と、ふちを光らせる逆光
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3632, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(8, 14, 10); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8); rim.position.set(-10, 4, -12); scene.add(rim);

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
  let downX = 0, downY = 0, downT = 0;
  canvas.addEventListener("pointerdown", (e) => { dragging = true; lastX = downX = e.clientX; lastY = downY = e.clientY; downT = performance.now(); velY = 0; canvas.setPointerCapture(e.pointerId); host.classList.add("is-grab"); });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    velY = dx * (e.pointerType === "touch" ? 0.018 : 0.012);
    rotY += velY;
    if (e.pointerType === "mouse") rotX = Math.max(-0.5, Math.min(0.5, rotX + dy * 0.006));
    wake();
  });
  const end = () => { dragging = false; idleAt = performance.now(); host.classList.remove("is-grab"); host.classList.add("is-used"); };
  // 動かさずに携帯の画面をタップしたら、画面を大きく見せる
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  canvas.addEventListener("pointerup", (e) => {
    const tap = Math.hypot(e.clientX - downX, e.clientY - downY) < 8 && performance.now() - downT < 450;
    end();
    if (!tap) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObject(scr, false).length) openViewer();
  });
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
  // 一度描いてみて、材質が使えなかったら軽い材質に替える
  renderer.render(scene, camera);
  if (shaderFailed) {
    scene.traverse((o) => {
      if (!o.isMesh || !o.material.isMeshPhysicalMaterial) return;
      const m = o.material;
      o.material = new THREE.MeshStandardMaterial({ color: m.color, map: m.map, metalness: m.metalness, roughness: m.roughness,
        emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, transparent: m.transparent, flatShading: m.flatShading });
    });
    log("switched to standard materials");
  }
  log("first frame drawn");
  host.classList.add("is-3d");
  host.appendChild(bar);
  // 「回せます」と一度だけ伝え、触ったら消す
  const note = host.querySelector(".hd-note");
  if (note && host.dataset.hint) {
    const base = note.textContent;
    note.textContent = base + " ・ " + host.dataset.hint;
    canvas.addEventListener("pointerdown", () => { note.textContent = base; }, { once: true });
  }
  wake();
}

function roundedPlane(w, h, r) {
  const sh = new THREE.Shape(), x = -w / 2, y = -h / 2;
  sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r);
  sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r);
  sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ShapeGeometry(sh, 24);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
  return geo;
}

function drawShadow() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 72;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(128, 36, 4, 128, 36, 120);
  gr.addColorStop(0, "rgba(40,30,20,.42)"); gr.addColorStop(1, "rgba(40,30,20,0)");
  g.fillStyle = gr; g.scale(1, 0.3); g.beginPath(); g.arc(128, 120, 120, 0, Math.PI * 2); g.fill();
  return c;
}

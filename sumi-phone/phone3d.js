// 1枚目の Soto Phone を3Dで見せる。指やマウスで左右に回すと360度、裏側まで見える。
// ・形は、Soto Phone のデザイン案の3Dモデル（models/soto-phone.glb）。仕上げはシルバー（ヘアラインのステンレス、鏡面のふち）
// ・画面はロック画面とホーム画面を、数秒ごとに切り替える
// ・スマホでは、縦のスクロールを邪魔しない（横に動かしたときだけ回る）
// ・WebGL が使えないときは、静止画のまま
import * as THREE from "/vendor/three/three.module.min.js";
import { GLTFLoader } from "/vendor/three/GLTFLoader.js";
import { MeshoptDecoder } from "/vendor/three/meshopt_decoder.module.js";

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
  // 撮影スタジオの光：上の大きな面光源と、斜め4方向の細長い光。回すと金属のふちに光の帯が走る
  const studio = new THREE.Scene();
  {
    const cv = document.createElement("canvas"); cv.width = 4; cv.height = 256;
    const c = cv.getContext("2d"), gr = c.createLinearGradient(0, 0, 0, 256);
    [[0, "#ffffff"], [0.42, "#eef0f3"], [0.5, "#d7dbe0"], [0.56, "#a9adb3"], [0.75, "#8a8e95"], [1, "#6a6d73"]].forEach(([o, k]) => gr.addColorStop(o, k));
    c.fillStyle = gr; c.fillRect(0, 0, 4, 256);
    const gt = new THREE.CanvasTexture(cv); gt.colorSpace = THREE.SRGBColorSpace;
    studio.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.MeshBasicMaterial({ map: gt, side: THREE.BackSide })));
    const panel = (w, h, x, y, z, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); studio.add(m);
    };
    panel(16, 7, 0, 14, 0, 3.0);
    panel(4, 26, -16, 2, 10, 7.0); panel(4, 26, 16, 2, -10, 7.0);
    panel(4, 26, 16, 2, 10, 5.0); panel(4, 26, -16, 2, -10, 5.0);
  }
  scene.environment = pmrem.fromScene(studio, 0.025).texture;

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
  const [gltf, lockTex, homeTex, stripTex, backTex, logoTex] = await Promise.all([
    loadModel(),
    loadTex("/images/phone/screen-lock.jpg"), loadTex("/images/phone/screen-home.jpg"),
    loadTex("/images/phone/hairline-strip.jpg"), loadTex("/images/phone/back-brushed.jpg"), loadTex("/images/phone/logo-light.png"),
  ]);
  if (stripTex) { stripTex.wrapS = stripTex.wrapT = THREE.RepeatWrapping; stripTex.repeat.set(0.35, 1.6); }
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  // 無地の正方形：ヘアラインの金属の枠とボタン、模様のないヘアラインの背面。ネジは見せない
  const frame = () => phys({ color: 0x5d5e60, map: stripTex, metalness: 0.75, roughness: 0.3, emissive: 0x1a1b1d, envMapIntensity: 0.8 });
  const M = {
    body: frame(), edge: frame(), button: frame(),
    back: phys({ color: 0xc4c6ca, metalness: 1, roughness: 0.3 }),
    ring: phys({ color: 0xd3d4d6, metalness: 1, roughness: 0.32 }),
    glass: phys({ color: 0x050506, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02 }),
    display: phys({ color: 0x080808, metalness: 0, roughness: 0.3 }),
    lens: phys({ color: 0x030305, metalness: 0.2, roughness: 0.03, clearcoat: 1, iridescence: 0.6, iridescenceIOR: 1.6 }),
    flash: phys({ color: 0xfff0cf, metalness: 0, roughness: 0.25, emissive: 0x332a18 }),
    black: phys({ color: 0x111111, metalness: 0, roughness: 0.6 }),
    ear: phys({ color: 0x0d0d0e, metalness: 0, roughness: 0.7 }),
    antenna: phys({ color: 0x3e3f42, metalness: 0, roughness: 0.6, clearcoat: 0.3 }),
  };
  const model = gltf.scene;
  const tmp = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isMesh) return;
    const cat = (o.name || "").split("_")[0];
    if (cat === "screw") { o.visible = false; return; }
    const m = M[cat];
    if (!m) return;
    o.material = m;
    // 枠・ボタン：面の向きごとに UV を貼り直し、ヘアラインが各辺に沿って流れるようにする
    if (cat === "body" || cat === "edge" || cat === "button") {
      const g = o.geometry;
      if (!g.attributes.normal) g.computeVertexNormals();
      o.updateMatrix();
      const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        tmp.fromBufferAttribute(p, i).applyMatrix4(o.matrix);
        const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
        if (az >= ax && az >= ay) { uv[i * 2] = tmp.x; uv[i * 2 + 1] = tmp.y; }
        else if (ax >= ay) { uv[i * 2] = tmp.y; uv[i * 2 + 1] = tmp.z; }
        else { uv[i * 2] = tmp.x; uv[i * 2 + 1] = tmp.z; }
      }
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    } else if (!o.geometry.attributes.normal) m.flatShading = true;
  });
  // 背面：模様のないヘアライン（写真から）。カメラとフラッシュの穴だけ抜く
  if (backTex) {
    const HALF = 3.37, PX = 1024 / (2 * HALF);
    const am = document.createElement("canvas"); am.width = am.height = 1024;
    const ac = am.getContext("2d");
    const toPx = (wx, wy) => [(-wx + HALF) * PX, (HALF - wy) * PX];
    ac.fillStyle = "#000"; ac.fillRect(0, 0, 1024, 1024);
    ac.fillStyle = "#fff"; ac.beginPath(); ac.roundRect(0, 0, 1024, 1024, 0.42 * PX); ac.fill();
    ac.fillStyle = "#000";
    for (const [hx, hy, r] of [[2.3, 2.3, 0.72], [1.3, 2.3, 0.16]]) {
      const [x, y] = toPx(hx, hy); ac.beginPath(); ac.arc(x, y, r * PX, 0, Math.PI * 2); ac.fill();
    }
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2),
      new THREE.MeshBasicMaterial({ map: backTex, alphaMap: new THREE.CanvasTexture(am), alphaTest: 0.5, toneMapped: false }));
    plate.rotation.y = Math.PI; plate.position.z = -0.004;
    model.add(plate);
  }
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
  logo.position.set(-1.7, 0.75, -0.006);
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

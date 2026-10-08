"""Procedural sumi-e (ink wash) nature backgrounds for the Sumi Phone site."""
import sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
W, H = 1920, 1200
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)

def rng(s): return np.random.default_rng(s)

def noise2d(seed, scales=(4, 8, 16, 32, 64, 128), aspect=(1, 1), gain=0.55):
    r = rng(seed); out = np.zeros((H, W), np.float32); amp = 1; tot = 0
    for s in scales:
        g = r.random((max(2, int(s * aspect[1])), max(2, int(s * aspect[0] * W / H)))).astype(np.float32)
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
        out += amp * (np.asarray(im, np.float32) / 255); tot += amp; amp *= gain
    return out / tot

def noise1d(seed, n=W, scales=(3, 7, 15, 31, 63, 127, 255), gain=0.5):
    r = rng(seed); out = np.zeros(n, np.float32); amp = 1; tot = 0
    x = np.linspace(0, 1, n)
    for s in scales:
        pts = r.random(s + 1); xp = np.linspace(0, 1, s + 1)
        # cosine interpolation
        idx = np.minimum((x * s).astype(int), s - 1); t = x * s - idx
        t = (1 - np.cos(t * math.pi)) / 2
        out += amp * (pts[idx] * (1 - t) + pts[idx + 1] * t); tot += amp; amp *= gain
    return out / tot

def grad(top, bot, power=1.0):
    t = (YY / (H - 1)) ** power
    top, bot = np.array(top, np.float32), np.array(bot, np.float32)
    return top[None, None] * (1 - t[..., None]) + bot[None, None] * t[..., None]

def blur(a, r):
    if r <= 0: return a
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255

def paint(img, alpha, color):
    c = np.array(color, np.float32)
    return img * (1 - alpha[..., None]) + c[None, None] * alpha[..., None]

def ridge_layer(seed, base, height, fade, rough=1.0, soft=1.5, tex_seed=None):
    n = noise1d(seed)
    n = (n - n.min()) / (n.max() - n.min() + 1e-6)
    ridge = base - n * height
    d = YY - ridge[None, :]
    a = np.clip(1 - d / fade, 0, 1) * (d > 0)
    a = a ** 0.8
    if tex_seed is not None:
        tex = noise2d(tex_seed, scales=(16, 48, 160, 400), aspect=(1, 0.5))
        a = a * (0.6 + 0.6 * tex)
    return blur(np.clip(a, 0, 1), soft)

def mist(seed, strength, band=None):
    m = noise2d(seed, scales=(2, 4, 8, 16), aspect=(1, 0.35), gain=0.6)
    m = np.clip((m - 0.35) * 2.2, 0, 1)
    if band:
        c, w = band
        m *= np.exp(-((YY - c) / w) ** 2)
    return m * strength

def paper(img, seed, amt=10):
    g = noise2d(seed, scales=(200, 500), gain=0.7)
    fib = rng(seed).normal(0, 1, (H, W)).astype(np.float32)
    return img + (g - 0.5)[..., None] * amt + fib[..., None] * 2.2

def vignette(img, k=0.45):
    d = ((XX / W - 0.5) ** 2 + (YY / H - 0.5) ** 2) ** 0.5
    return img * (1 - k * np.clip(d * 1.4, 0, 1) ** 2)[..., None]

def save(img, name):
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(
        f"{OUT}/{name}.jpg", quality=80, optimize=True, progressive=True)
    print("saved", name)

def disc(cx, cy, r, soft=2):
    d = np.sqrt((XX - cx) ** 2 + (YY - cy) ** 2)
    return np.clip((r - d) / soft + 0.5, 0, 1)

# 1. 夜明けの山 — misty mountain ranges at dawn
def mountains():
    img = grad((118, 112, 108), (196, 170, 140), 1.4)
    glow = np.exp(-(((XX - W * 0.68) / 520) ** 2 + ((YY - H * 0.42) / 260) ** 2))
    img += glow[..., None] * np.array([60, 38, 12])
    img = paint(img, disc(W * 0.68, H * 0.30, 46, 3) * 0.75, (238, 222, 196))
    layers = [  # seed, base, height, fade, color, soft
        (11, H * 0.52, 260, 260, (128, 116, 110), 6),
        (12, H * 0.62, 230, 300, (100, 92, 90), 4),
        (13, H * 0.72, 260, 340, (70, 66, 66), 2.5),
        (14, H * 0.85, 240, 420, (40, 38, 40), 1.6),
        (15, H * 1.02, 260, 600, (18, 18, 20), 1.2),
    ]
    for i, (s, b, h, f, c, sf) in enumerate(layers):
        img = paint(img, ridge_layer(s, b, h, f, soft=sf, tex_seed=s + 100), c)
        img = paint(img, mist(s + 50, 0.55, (b - h * 0.2, 120)), (190, 176, 160))
    return vignette(paper(img, 1), 0.5)

# 2. 竹林 — bamboo grove
def bamboo():
    img = grad((150, 160, 140), (70, 80, 70), 1.0)
    r = rng(2)
    for depth in range(4):  # far -> near
        m = Image.new("L", (W, H), 0); dr = ImageDraw.Draw(m)
        count = [26, 18, 11, 6][depth]; width = [10, 20, 36, 70][depth]
        for _ in range(count):
            x = r.uniform(-50, W + 50); w = width * r.uniform(0.7, 1.3); lean = r.uniform(-60, 60)
            dr.polygon([(x, -10), (x + w, -10), (x + w + lean, H + 10), (x + lean, H + 10)], fill=255)
            y = r.uniform(-200, 0)
            while y < H:  # nodes
                t = y / H; nx = x + lean * t
                dr.line([(nx - 2, y), (nx + w + 2, y)], fill=110, width=max(2, int(w * 0.12)))
                y += r.uniform(160, 300) * (1 + depth * 0.3)
            for _ in range(int(6 + depth * 4)):  # leaves
                ly = r.uniform(0, H * 0.7); lx = x + lean * ly / H + w / 2
                ang = r.uniform(-2.6, -0.5) if r.random() < 0.5 else r.uniform(0.5, 2.6)
                L = r.uniform(60, 140) * (0.6 + depth * 0.5); Wd = L * 0.13
                ca, sa = math.cos(ang), math.sin(ang + 0.6)
                tip = (lx + ca * L, ly + abs(sa) * L * 0.5)
                mid = (lx + ca * L * 0.4, ly + abs(sa) * L * 0.2)
                px, py = -math.sin(ang) * Wd, math.cos(ang) * Wd
                dr.polygon([(lx, ly), (mid[0] + px, mid[1] + py), tip, (mid[0] - px, mid[1] - py)], fill=230)
        a = np.asarray(m, np.float32) / 255
        tex = noise2d(20 + depth, scales=(30, 120, 400), aspect=(0.2, 1))
        a = blur(a * (0.75 + 0.4 * tex), [7, 4, 2, 1.2][depth])
        col = [(118, 128, 112), (84, 94, 82), (50, 58, 50), (22, 26, 22)][depth]
        img = paint(img, np.clip(a * [0.7, 0.85, 0.95, 1][depth], 0, 1), col)
        img = paint(img, mist(30 + depth, 0.35, (H * 0.75, 300)), (170, 178, 160))
    rays = np.clip(np.sin((XX * 0.8 + YY * 0.45) / 70) * 0.5 + 0.5, 0, 1) ** 8
    img += (rays * np.exp(-(YY / H) * 2) * 30)[..., None]
    return vignette(paper(img, 2), 0.55)

# 3. 湖と月 — moonlit still lake
def lake():
    hz = H * 0.58
    img = grad((24, 30, 42), (86, 96, 112), 1.3)
    img = paint(img, np.exp(-(((XX - W * 0.3) ** 2 + (YY - H * 0.24) ** 2) / 220 ** 2))[..., None].squeeze() * 0.35, (170, 178, 190))
    img = paint(img, disc(W * 0.3, H * 0.24, 54, 2), (236, 234, 224))
    img = paint(img, mist(41, 0.25, (H * 0.3, 140)), (110, 118, 134))
    shore = ridge_layer(42, hz, 140, 900, soft=2, tex_seed=43)
    shore *= (YY < hz)
    img = paint(img, shore, (18, 22, 30))
    # water
    water = YY >= hz
    refl_src = img.copy()
    yy = np.clip(2 * hz - YY, 0, H - 1).astype(int)
    ripple = (noise2d(44, scales=(4, 30, 200), aspect=(0.15, 3)) - 0.5) * 18
    xx = np.clip(XX + ripple, 0, W - 1).astype(int)
    refl = refl_src[yy, xx] * 0.62 + np.array([6, 9, 14])
    img = np.where(water[..., None], refl, img)
    streak = np.exp(-((XX - W * 0.3) / (40 + np.abs(YY - hz) * 0.25)) ** 2) * water
    lines = noise2d(45, scales=(6, 60, 300), aspect=(0.04, 4))
    img += (streak * np.clip(lines - 0.45, 0, 1) * 260)[..., None]
    img = paint(img, mist(46, 0.4, (hz, 40)), (96, 104, 120))
    return vignette(paper(img, 3, 6), 0.5)

# 4. 海 — sea at dusk
def sea():
    hz = H * 0.5
    img = grad((60, 64, 72), (200, 150, 110), 1.6)
    sun = np.exp(-(((XX - W * 0.62) / 360) ** 2 + ((YY - hz) / 110) ** 2))
    img += sun[..., None] * np.array([70, 40, 10])
    clouds = noise2d(51, scales=(3, 9, 30, 90), aspect=(0.3, 1))
    cl = np.clip((clouds - 0.5) * 3, 0, 1) * (YY < hz * 0.95) * np.clip(1 - YY / hz, 0, 1) ** 0.3
    img = paint(img, blur(cl, 3) * 0.65, (48, 48, 56))
    t = np.clip((YY - hz) / (H - hz), 0, 1)
    water = grad((120, 98, 86), (14, 18, 26), 1.0)
    swell = noise2d(52, scales=(5, 18, 70, 300), aspect=(0.06 + 0, 2.5))
    water = water * (0.75 + 0.5 * swell[..., None])
    glit = np.exp(-((XX - W * 0.62) / (60 + t * 520)) ** 2) * np.clip(swell - 0.55, 0, 1) * 600 * (1 - t) ** 1.5
    water += glit[..., None] * np.array([1, 0.8, 0.6])
    img = np.where((YY >= hz)[..., None], water, img)
    img = paint(img, blur((np.abs(YY - hz) < 1.5).astype(np.float32), 1) * 0.5, (210, 170, 130))
    return vignette(paper(img, 4, 6), 0.55)

# 5. 雪と松 — pine in falling snow
def pine():
    img = grad((150, 156, 162), (196, 200, 204), 1)
    for i, (s, b, h, f, c) in enumerate([(61, H * 0.62, 200, 300, (128, 134, 140)), (62, H * 0.78, 180, 380, (96, 102, 110))]):
        img = paint(img, ridge_layer(s, b, h, f, soft=5 - i * 2, tex_seed=s + 9), c)
        img = paint(img, mist(s + 3, 0.5, (b - 40, 120)), (176, 182, 188))
    m = Image.new("L", (W, H), 0); dr = ImageDraw.Draw(m); r = rng(6)
    # trunk: curved
    pts = [(W * 0.18 + math.sin(t * 2.4) * 120 + t * 260, H * (1.05 - t * 1.0)) for t in np.linspace(0, 1, 60)]
    for i, (x, y) in enumerate(pts):
        w = 46 * (1 - i / 70)
        dr.ellipse([x - w, y - w, x + w, y + w], fill=255)
    for k in range(9):  # branches with needle pads
        t = 0.32 + k * 0.075; bx, by = pts[int(t * 59)]
        dirn = 1 if k % 2 == 0 else -0.7
        L = r.uniform(220, 480) * (1.1 - t * 0.5)
        ex, ey = bx + dirn * L, by - r.uniform(-30, 60)
        dr.line([(bx, by), (ex, ey)], fill=255, width=int(14 * (1.2 - t)))
        for _ in range(16):
            u = r.uniform(0.3, 1.1); cx = bx + (ex - bx) * u; cy = by + (ey - by) * u - r.uniform(10, 50)
            rw, rh = r.uniform(60, 140) * (1.2 - t * 0.6), r.uniform(18, 42)
            dr.ellipse([cx - rw, cy - rh, cx + rw, cy + rh], fill=int(r.uniform(180, 255)))
    a = np.asarray(m, np.float32) / 255
    tex = noise2d(63, scales=(40, 160, 500))
    a = blur(np.clip(a * (0.7 + 0.5 * tex), 0, 1), 1.2)
    img = paint(img, a, (22, 26, 28))
    # snow on pads (light caps)
    cap = np.clip(a - np.roll(a, 8, axis=0), 0, 1)
    img = paint(img, blur(cap, 1.5) * 0.8, (226, 230, 234))
    img = img * 0.72  # darken for legibility
    snow = np.zeros((H, W), np.float32); r2 = rng(64)
    for size, n, bl in [(1.4, 2200, 0.6), (2.6, 600, 1.2), (5, 120, 2.5)]:
        layer = Image.new("L", (W, H), 0); d2 = ImageDraw.Draw(layer)
        for _ in range(n):
            x, y = r2.uniform(0, W), r2.uniform(0, H); s = size * r2.uniform(0.6, 1.4)
            d2.ellipse([x - s, y - s, x + s, y + s], fill=255)
        snow = np.maximum(snow, blur(np.asarray(layer, np.float32) / 255, bl))
    img = paint(img, snow * 0.9, (245, 247, 250))
    return vignette(paper(img, 5, 6), 0.45)

# 6. 枯山水 — raked stone garden, seen from above at dusk
def garden():
    stones = [(W * 0.30, H * 0.42, 150, 110), (W * 0.70, H * 0.62, 110, 85), (W * 0.58, H * 0.28, 60, 48)]
    field = YY.copy()
    dist_min = np.full((H, W), 1e9, np.float32)
    for cx, cy, rx, ry in stones:
        d = np.sqrt(((XX - cx) / rx) ** 2 + ((YY - cy) / ry) ** 2) * (rx + ry) / 2
        dist_min = np.minimum(dist_min, d - (rx + ry) / 2)
    ring_zone = dist_min < 260
    base = np.where(ring_zone, dist_min, YY + noise1d(71)[None, :] * 30)
    rake = np.sin(base / 9.0 * math.pi) * 0.5 + 0.5
    rake = blur(rake, 1.2)
    sand = 150 + rake * 38 + (noise2d(72, scales=(60, 300, 900)) - 0.5) * 30
    img = np.repeat(sand[..., None], 3, 2) * np.array([1.0, 0.97, 0.92])
    light = 0.55 + 0.45 * np.clip(1 - ((XX - W * 0.2) ** 2 + (YY - H * 0.1) ** 2) ** 0.5 / (W * 1.1), 0, 1)
    img = img * light[..., None]
    sh = np.zeros((H, W), np.float32)
    for cx, cy, rx, ry in stones:
        sh = np.maximum(sh, disc(cx + 30, cy + 26, 1, 1) * 0)  # placeholder
        d = np.sqrt(((XX - cx - 28) / (rx * 1.08)) ** 2 + ((YY - cy - 24) / (ry * 1.08)) ** 2)
        sh = np.maximum(sh, np.clip(1.25 - d, 0, 1))
    img = paint(img, blur(sh, 18) * 0.55, (30, 28, 26))
    tex = noise2d(73, scales=(20, 80, 300))
    for i, (cx, cy, rx, ry) in enumerate(stones):
        wob = noise1d(74 + i, n=360)
        ang = np.arctan2(YY - cy, XX - cx); idx = ((ang + math.pi) / (2 * math.pi) * 359).astype(int)
        rr = np.sqrt(((XX - cx) / rx) ** 2 + ((YY - cy) / ry) ** 2) / (0.85 + 0.3 * wob[idx])
        a = np.clip((1 - rr) * 40, 0, 1)
        shade = np.clip(0.4 + ((XX - cx) * -0.5 + (YY - cy) * -0.6) / rx * 0.5, 0.15, 1)
        col = (np.array([60, 58, 54])[None, None] * (0.5 + shade[..., None]) * (0.7 + 0.6 * tex[..., None]))
        moss = np.clip((1 - rr) * 3 - 1.6, 0, 1) * np.clip(tex - 0.5, 0, 1) * 3
        col = col * (1 - moss[..., None]) + np.array([62, 78, 48]) * moss[..., None]
        img = img * (1 - a[..., None]) + col * a[..., None]
    img = img * 0.62
    return vignette(paper(img, 6, 6), 0.6)

# 7. 星空 — night sky over ridge
def night():
    img = grad((6, 8, 16), (34, 40, 58), 1.2)
    band = np.exp(-((YY - (H * 0.9 - XX * 0.45)) / 230) ** 2)
    neb = noise2d(81, scales=(4, 12, 40, 140, 400))
    img += (band * np.clip(neb - 0.3, 0, 1) * 90)[..., None] * np.array([0.8, 0.85, 1])
    dark = noise2d(82, scales=(8, 30, 90))
    img -= (band * np.clip(dark - 0.55, 0, 1) * 80)[..., None]
    r = rng(83); stars = Image.new("L", (W, H), 0); ds = ImageDraw.Draw(stars)
    for _ in range(1700):
        x, y = r.uniform(0, W), r.uniform(0, H * 0.9); s = r.power(6) * 2.2 + 0.3
        ds.ellipse([x - s, y - s, x + s, y + s], fill=int(min(255, 90 + r.random() * 200 * (s / 1.5))))
    st = np.asarray(stars, np.float32) / 255
    img = paint(img, np.clip(st + blur(st, 3) * 0.8, 0, 1), (235, 238, 255))
    img = paint(img, ridge_layer(84, H * 0.86, 150, 260, soft=2, tex_seed=85), (26, 30, 42))
    img = paint(img, ridge_layer(86, H * 1.0, 210, 2000, soft=1.2), (6, 7, 10))
    return vignette(paper(img, 7, 4), 0.5)

for name, fn in [("01-mountains", mountains), ("02-bamboo", bamboo), ("03-lake", lake),
                 ("04-sea", sea), ("05-pine", pine), ("06-garden", garden), ("07-night", night)]:
    if len(sys.argv) > 2 and name not in sys.argv[2:]: continue
    save(fn(), name)

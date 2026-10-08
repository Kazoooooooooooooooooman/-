"""Hand-drawn line + watercolor backgrounds for the second half of the Soto Phone page.

Colour grows scene by scene (SAT), from a faint wash to a full sunset.
Usage: python3 tools/gen_watercolor.py images [scene names...]
"""
import sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
W, H = 1920, 1200
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)
INK = np.array([58, 54, 50], np.float32)

def rng(s): return np.random.default_rng(s)

def noise2d(seed, scales=(4, 8, 16, 32, 64, 128), aspect=(1, 1), gain=0.55):
    r = rng(seed); out = np.zeros((H, W), np.float32); amp = 1; tot = 0
    for s in scales:
        g = r.random((max(2, int(s * aspect[1])), max(2, int(s * aspect[0] * W / H)))).astype(np.float32)
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
        out += amp * (np.asarray(im, np.float32) / 255); tot += amp; amp *= gain
    return out / tot

def noise1d(seed, n=W, scales=(3, 7, 15, 31, 63), gain=0.5):
    r = rng(seed); out = np.zeros(n, np.float32); amp = 1; tot = 0
    x = np.linspace(0, 1, n)
    for s in scales:
        pts = r.random(s + 1)
        idx = np.minimum((x * s).astype(int), s - 1); t = x * s - idx
        t = (1 - np.cos(t * math.pi)) / 2
        out += amp * (pts[idx] * (1 - t) + pts[idx + 1] * t); tot += amp; amp *= gain
    out /= tot
    return (out - out.min()) / (out.max() - out.min() + 1e-6)

def blur(a, r):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255

GRAIN = None
def paper_base():
    global GRAIN
    img = np.zeros((H, W, 3), np.float32) + np.array([243, 240, 232], np.float32)
    g = noise2d(1, scales=(200, 500), gain=0.7)
    fib = rng(1).normal(0, 1, (H, W)).astype(np.float32)
    img += (g - 0.5)[..., None] * 8 + fib[..., None] * 1.8
    GRAIN = noise2d(2, scales=(120, 300, 700), gain=0.6)
    return img

def tint(color, sat):
    c = np.array(color, np.float32); g = c.mean()
    return g + (c - g) * sat

def wash(img, shape, color, strength, sat, seed=0, soft=3, fade=None):
    """Watercolor wash: soft, granulated, with a darker dried edge. Multiply-blended like pigment."""
    m = blur(np.clip(shape, 0, 1), soft)
    if fade is not None:
        m = m * fade
    gran = 0.72 + 0.56 * (GRAIN * 0.6 + noise2d(seed + 7, scales=(10, 30, 90)) * 0.4)
    edge = np.clip(m - blur(m, 9), 0, 1) * 2.2
    a = np.clip((m * gran + edge) * strength, 0, 0.95)
    c = tint(color, sat) / 255.0
    return img * (1 - a[..., None] * (1 - c[None, None]))

def lines(img, polylines, seed, width=3, alpha=0.78):
    """Sketchy pen lines: each stroke drawn twice with small jitter, like the hand-drawn story pages."""
    r = rng(seed); m = Image.new("L", (W, H), 0); d = ImageDraw.Draw(m)
    for pl in polylines:
        for k in range(2):
            j = [(x + r.normal(0, 1.4), y + r.normal(0, 1.4)) for x, y in pl]
            d.line(j, fill=255 if k == 0 else 150, width=width if k == 0 else max(1, width - 1), joint="curve")
    a = np.asarray(m.filter(ImageFilter.GaussianBlur(0.7)), np.float32) / 255 * alpha
    return img * (1 - a[..., None]) + INK[None, None] * a[..., None]

def ridge(seed, base, height, n=W):
    return base - noise1d(seed, n) * height

def ridge_poly(rv, step=24):
    return [(x, float(rv[min(x, W - 1)])) for x in range(0, W + step, step)]

def below(rv, soft=3):
    return np.clip((YY - rv[None, :]) / soft, 0, 1)

def circle(cx, cy, r):
    return np.clip(r - np.sqrt((XX - cx) ** 2 + (YY - cy) ** 2), 0, 1)

def ellipse_pts(cx, cy, rx, ry, n=40, seed=0, wob=0.06):
    r = rng(seed)
    return [(cx + math.cos(t) * rx * (1 + r.normal(0, wob)), cy + math.sin(t) * ry * (1 + r.normal(0, wob))) for t in np.linspace(0, 2 * math.pi, n)]

def tree(cx, base, h, seed):
    """A simple hand-drawn round tree: crown outline + trunk line; returns (crown mask, polylines)."""
    rx, ry = h * 0.32, h * 0.38
    crown = np.clip(1 - np.sqrt(((XX - cx) / rx) ** 2 + ((YY - (base - h * 0.62)) / ry) ** 2), 0, 1) * 6
    pls = [ellipse_pts(cx, base - h * 0.62, rx, ry, 28, seed), [(cx, base - h * 0.3), (cx + 2, base)]]
    return np.clip(crown, 0, 1), pls

def save(img, name):
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(f"{OUT}/{name}.jpg", quality=82, optimize=True, progressive=True)
    print("saved", name)

# ---------------------------------------------------------------- scenes
# 1. 丘：朝の丘と小道（いちばん淡い）
def hills(sat=0.28):
    img = paper_base()
    img = wash(img, np.clip(1 - YY / (H * 0.55), 0, 1), (150, 190, 225), 0.35, sat, 11, soft=20)
    img = wash(img, circle(W * 0.72, H * 0.22, 70), (245, 200, 120), 0.5, sat, 12)
    r1 = ridge(13, H * 0.55, 140); r2 = ridge(14, H * 0.7, 120); r3 = ridge(15, H * 0.86, 90)
    for rv, col, st, sd in [(r1, (140, 175, 120), 0.45, 16), (r2, (120, 165, 95), 0.55, 17), (r3, (105, 150, 80), 0.6, 18)]:
        img = wash(img, below(rv), col, st, sat, sd, fade=1 - 0.45 * np.clip((YY - rv[None, :]) / 300, 0, 1))
    path = [(W * 0.5 + math.sin(t * 2.2) * 160 * t, H * 0.62 + t * H * 0.45) for t in np.linspace(0, 1, 30)]
    pl = [ridge_poly(r1), ridge_poly(r2), ridge_poly(r3), path, [(x + 70 + 90 * (y - H * 0.62) / (H * 0.45), y) for x, y in path]]
    pl.append(ellipse_pts(W * 0.72, H * 0.22, 70, 70, 30, 19))
    trees = []
    for i, (tx, th) in enumerate([(W * 0.18, 180), (W * 0.25, 130), (W * 0.83, 200), (W * 0.9, 150)]):
        cm, tp = tree(tx, float(r2[int(tx)]) + 20, th, 30 + i); trees.append(cm); pl += tp
    img = wash(img, np.maximum.reduce(trees), (95, 145, 85), 0.6, sat, 20)
    return lines(img, pl, 21)

# 2. 湖：山と湖とボート
def lake(sat=0.42):
    img = paper_base()
    hz = H * 0.58
    img = wash(img, np.clip(1 - YY / hz, 0, 1), (140, 185, 225), 0.45, sat, 31, soft=24)
    m1 = ridge(32, H * 0.42, 220); m2 = ridge(33, H * 0.52, 160)
    img = wash(img, below(m1) * (YY < hz), (150, 160, 190), 0.4, sat, 34)
    img = wash(img, below(m2) * (YY < hz), (110, 150, 120), 0.5, sat, 35)
    water = (YY >= hz).astype(np.float32)
    ripple = noise2d(36, scales=(6, 40, 160), aspect=(0.1, 3))
    img = wash(img, water * (0.6 + 0.5 * ripple), (110, 165, 210), 0.5, sat, 37, soft=2)
    # reflection of the near hills
    refl = np.clip((2 * hz - YY - m2[None, :]) / 3, 0, 1) * water * np.clip(1 - (YY - hz) / 220, 0, 1)
    img = wash(img, refl, (100, 140, 120), 0.3, sat, 38)
    bx, by = W * 0.62, hz + 120
    boat = [(bx - 90, by), (bx + 90, by), (bx + 60, by + 30), (bx - 60, by + 30), (bx - 90, by)]
    img = wash(img, np.clip((1 - np.abs(XX - bx) / 90) * 4, 0, 1) * ((YY > by) & (YY < by + 30)), (200, 120, 80), 0.6, sat, 39)
    pl = [ridge_poly(m1), ridge_poly(m2), [(0, hz), (W, hz)], boat, [(bx, by), (bx, by - 110), (bx + 60, by - 20), (bx, by - 20)]]
    pl += [[(x, hz + 60 + 40 * k), (x + 120, hz + 60 + 40 * k)] for k, x in enumerate([300, 900, 1400, 500])]
    return lines(img, pl, 40)

# 3. 湯：温泉と湯けむりと紅葉
def onsen(sat=0.6):
    img = paper_base()
    img = wash(img, np.clip(1 - YY / (H * 0.6), 0, 1), (235, 190, 150), 0.35, sat, 51, soft=24)
    m = ridge(52, H * 0.45, 200)
    img = wash(img, below(m), (150, 120, 110), 0.4, sat, 53, fade=1 - 0.6 * np.clip((YY - m[None, :]) / 400, 0, 1))
    hz = H * 0.66
    pool = np.clip(1 - np.sqrt(((XX - W * 0.5) / (W * 0.36)) ** 2 + ((YY - (hz + 160)) / 170) ** 2), 0, 1) * 8
    img = wash(img, np.clip(pool, 0, 1), (120, 180, 200), 0.55, sat, 54)
    pl = [ridge_poly(m), ellipse_pts(W * 0.5, hz + 160, W * 0.36, 170, 50, 55, 0.04)]
    rocks = []
    r = rng(56)
    for i in range(14):
        a = i / 14 * 2 * math.pi
        cx, cy = W * 0.5 + math.cos(a) * W * 0.37, hz + 160 + math.sin(a) * 178
        rx, ry = r.uniform(50, 95), r.uniform(28, 48)
        rocks.append(np.clip(1 - np.sqrt(((XX - cx) / rx) ** 2 + ((YY - cy) / ry) ** 2), 0, 1) * 6)
        pl.append(ellipse_pts(cx, cy, rx, ry, 18, 60 + i, 0.08))
    img = wash(img, np.clip(np.maximum.reduce(rocks), 0, 1), (130, 125, 120), 0.6, sat, 57)
    trees = []
    for i, (tx, th) in enumerate([(W * 0.1, 320), (W * 0.2, 240), (W * 0.84, 300), (W * 0.93, 230)]):
        cm, tp = tree(tx, hz + 40, th, 70 + i); trees.append(cm); pl += tp
    img = wash(img, np.maximum.reduce(trees), (215, 100, 60), 0.65, sat, 58)
    steam = noise2d(59, scales=(3, 7, 15, 30), aspect=(1, 0.8))
    steam = np.clip((steam - 0.45) * 3, 0, 1) * np.exp(-((XX - W * 0.5) / (W * 0.3)) ** 2) * np.clip((YY - H * 0.2) / (hz - H * 0.2), 0, 1) * (YY < hz + 120)
    img = img * (1 - blur(steam, 12)[..., None] * 0.45) + np.array([250, 248, 244]) * blur(steam, 12)[..., None] * 0.45
    for k, sx in enumerate([W * 0.42, W * 0.5, W * 0.58]):
        pl.append([(sx + math.sin(t * 6 + k) * 22, hz + 40 - t * 260) for t in np.linspace(0, 1, 20)])
    return lines(img, pl, 61)

# 4. 川：森の渓流
def river(sat=0.76):
    img = paper_base()
    img = wash(img, np.clip(1 - YY / (H * 0.5), 0, 1), (140, 195, 235), 0.45, sat, 71, soft=24)
    m1 = ridge(72, H * 0.4, 180); m2 = ridge(73, H * 0.55, 160)
    img = wash(img, below(m1), (110, 150, 170), 0.4, sat, 74, fade=1 - 0.5 * np.clip((YY - m1[None, :]) / 300, 0, 1))
    img = wash(img, below(m2), (80, 150, 85), 0.6, sat, 75)
    t = np.clip((YY - H * 0.55) / (H * 0.45), 0, 1)
    center = W * 0.5 + np.sin(t * 4 + 0.5) * 260 * t
    half = 10 + t ** 1.5 * 360
    riv = np.clip((half - np.abs(XX - center)) / 3, 0, 1) * (YY > H * 0.55)
    img = img * (1 - riv[..., None] * 0.5) + np.array([243, 240, 232]) * riv[..., None] * 0.5
    img = wash(img, riv, (70, 150, 210), 0.6, sat, 76)
    pl = [ridge_poly(m1), ridge_poly(m2)]
    ys = np.linspace(H * 0.56, H, 30)
    for sgn in (-1, 1):
        pl.append([(W * 0.5 + math.sin(((y - H * 0.55) / (H * 0.45)) * 4 + 0.5) * 260 * ((y - H * 0.55) / (H * 0.45)) + sgn * (10 + ((y - H * 0.55) / (H * 0.45)) ** 1.5 * 360), y) for y in ys])
    trees = []
    for i, tx in enumerate([W * 0.06, W * 0.14, W * 0.22, W * 0.78, W * 0.87, W * 0.95]):
        th = 260 + (i % 3) * 60
        cm, tp = tree(tx, H * 0.7 + (i % 2) * 40, th, 80 + i); trees.append(cm); pl += tp
    img = wash(img, np.maximum.reduce(trees), (60, 140, 70), 0.7, sat, 77)
    return lines(img, pl, 78)

# 5. 山：晴れた山と登山道
def mountain(sat=0.9):
    img = paper_base()
    img = wash(img, np.clip(1 - YY / (H * 0.7), 0, 1), (110, 175, 235), 0.6, sat, 91, soft=24)
    peak = H * 0.2 + np.abs(XX[0] - W * 0.55) * 0.75 + noise1d(92) * 60
    img = wash(img, below(peak), (110, 130, 175), 0.5, sat, 93)
    snow = below(peak) * (YY < peak[None, :] + 70 + 50 * noise1d(98)[None, :]) * np.clip((H * 0.46 - YY) / 140, 0, 1)
    img = img * (1 - blur(snow, 2)[..., None] * 0.7) + np.array([248, 247, 244]) * blur(snow, 2)[..., None] * 0.7
    near = ridge(94, H * 0.72, 150)
    img = wash(img, below(near), (90, 160, 80), 0.65, sat, 95)
    trail = [(W * 0.2 + t * W * 0.35 + math.sin(t * 9) * 60, H - t * (H - float(near[int(W * 0.55)]) + 10)) for t in np.linspace(0, 1, 40)]
    pl = [[(x, float(peak[min(int(x), W - 1)])) for x in range(0, W + 24, 24)], ridge_poly(near), trail]
    pl.append([(x, float(peak[min(int(x), W - 1)]) + 100 + math.sin(x / 40) * 12) for x in range(int(W * 0.42), int(W * 0.68), 20)])
    for i, (cx, cy) in enumerate([(W * 0.2, H * 0.18), (W * 0.82, H * 0.14)]):
        pl.append([(cx - 90 + k * 15, cy + math.sin(k) * 10 - (abs(k - 6) < 4) * 20) for k in range(13)])
    trees = []
    for i, tx in enumerate([W * 0.08, W * 0.15, W * 0.88, W * 0.95]):
        cm, tp = tree(tx, float(near[int(tx)]) + 60, 220, 100 + i); trees.append(cm); pl += tp
    img = wash(img, np.maximum.reduce(trees), (50, 130, 70), 0.7, sat, 96)
    return lines(img, pl, 97)

# 6. 夕：夕焼けの海辺（いちばん色が豊か）
def sunset(sat=1.0):
    img = paper_base()
    hz = H * 0.6
    sky = np.clip(1 - YY / hz, 0, 1)
    img = wash(img, sky, (120, 120, 200), 0.45, sat, 111, soft=30, fade=np.clip(1 - YY / (hz * 0.6), 0, 1))
    img = wash(img, np.clip(YY / hz, 0, 1) * (YY < hz), (250, 150, 90), 0.6, sat, 112, soft=30)
    img = wash(img, circle(W * 0.5, hz - 40, 110), (245, 110, 70), 0.7, sat, 113)
    clouds = noise2d(114, scales=(3, 9, 27), aspect=(0.35, 1))
    img = wash(img, np.clip((clouds - 0.55) * 4, 0, 1) * (YY < hz * 0.8), (220, 120, 150), 0.45, sat, 115, soft=6)
    land = ridge(119, H * 0.86, 60)
    sea = ((YY >= hz) & (YY < land[None, :])).astype(np.float32)
    img = wash(img, sea, (80, 110, 170), 0.55, sat, 116, soft=2)
    glit = np.exp(-((XX - W * 0.5) / (60 + (YY - hz) * 0.6)) ** 2) * sea * np.clip(noise2d(117, scales=(6, 40, 160), aspect=(0.08, 3)) - 0.45, 0, 1) * 3
    img = wash(img, np.clip(glit, 0, 1), (250, 170, 90), 0.8, sat, 118, soft=1)
    img = wash(img, below(land), (225, 190, 140), 0.55, sat, 120)
    pl = [[(0, hz), (W, hz)], ridge_poly(land), ellipse_pts(W * 0.5, hz - 40, 110, 110, 30, 121, 0.03)]
    pl += [[(W * 0.5 - 300 + k * 160, hz + 70 + (k % 2) * 50), (W * 0.5 - 220 + k * 160, hz + 70 + (k % 2) * 50)] for k in range(5)]
    for i, (bx, by) in enumerate([(W * 0.3, H * 0.25), (W * 0.36, H * 0.21), (W * 0.68, H * 0.3)]):
        pl.append([(bx - 18, by), (bx - 6, by - 8), (bx, by), (bx + 6, by - 8), (bx + 18, by)])
    return lines(img, pl, 122)

SCENES = [("w1-hills", hills), ("w2-lake", lake), ("w3-onsen", onsen), ("w4-river", river), ("w5-mountain", mountain), ("w6-sunset", sunset)]
for name, fn in SCENES:
    if len(sys.argv) > 2 and name not in sys.argv[2:]: continue
    save(fn(), name)

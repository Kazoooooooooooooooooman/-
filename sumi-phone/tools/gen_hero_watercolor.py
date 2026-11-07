# リアル寄りの水彩：形と光は写真のまま、筆で置いたような色の面・塗りの縁・紙の質感を足す
# 使い方：python3 tools/gen_hero_watercolor.py 元の写真.jpg images/hero-watercolor.jpg（numpy と Pillow が必要）
import sys
import numpy as np
from PIL import Image, ImageFilter
src = Image.open(sys.argv[1]).convert('RGB')
W, H = src.size
A = lambda im: np.asarray(im, np.float32) / 255
I = lambda a: Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
img = A(src)

def box(a, r):
    # 積分画像で (2r+1) 四方の平均（端は複製）
    p = np.pad(a, ((r + 1, r), (r + 1, r)) + ((0, 0),) * (a.ndim - 2), mode='edge')
    c = p.cumsum(0).cumsum(1)
    k = 2 * r + 1
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)

def kuwahara(a, r):
    # 4つの小さな窓のうち、いちばん色むらの少ない窓の平均を使う → 輪郭は保ったまま、筆で塗った面になる
    lum = a.mean(2)
    m = box(a, r // 2); v = box(lum ** 2, r // 2) - box(lum, r // 2) ** 2
    h = r // 2 + 1
    offs = [(-h, -h), (-h, h), (h, -h), (h, h)]
    best = None; bestv = None
    P = 2 * h
    mp = np.pad(m, ((P, P), (P, P), (0, 0)), mode='edge'); vp = np.pad(v, ((P, P), (P, P)), mode='edge')
    Hh, Ww = v.shape
    for dy, dx in offs:
        mm = mp[P - dy:P - dy + Hh, P - dx:P - dx + Ww]; vv = vp[P - dy:P - dy + Hh, P - dx:P - dx + Ww]
        if best is None: best, bestv = mm.copy(), vv.copy()
        else:
            sel = vv < bestv
            best[sel] = mm[sel]; bestv[sel] = vv[sel]
    return best

paint = kuwahara(img, 4)
paint = kuwahara(paint, 3)
paint = A(I(paint).filter(ImageFilter.GaussianBlur(1.2)))
base = paint * 0.78 + img * 0.22
# 色を少し淡く、紙の白を透かす
paper = np.array([246, 243, 235], np.float32) / 255
lum = base.mean(2, keepdims=True)
base = base * 0.86 + lum * 0.14
base = base * 0.9 + paper * 0.1
# 塗りの縁に絵の具が溜まる（濃淡の境目の、暗い側を少し濃く）
l = lum[..., 0]
dog = A(I(l).filter(ImageFilter.GaussianBlur(3))) - l
base *= (1 - np.clip(dog * 2.2, 0, 0.22))[..., None]
# にじみ：明るい所に、隣の色がふわっと広がる
bleed = A(I(base).filter(ImageFilter.GaussianBlur(5)))
base = base * 0.82 + bleed * 0.18
# 塗りむら・顔料の粒・紙の繊維
def noise(scale, seed):
    r = np.random.default_rng(seed).random((max(2, H // scale), max(2, W // scale))).astype(np.float32)
    return A(I(r).resize((W, H), Image.BICUBIC))
blotch = noise(80, 1) * 0.5 + noise(28, 2) * 0.3 + noise(9, 3) * 0.2
base *= (0.93 + blotch * 0.12)[..., None]
gran = A(I(np.random.default_rng(5).random((H, W)).astype(np.float32)).filter(ImageFilter.GaussianBlur(0.8)))
dark = 1 - l
base *= (1 - (gran - 0.5) * 0.10 * (0.4 + dark))[..., None]
I(base).save(sys.argv[2], quality=86, optimize=True, progressive=True)
print('ok')

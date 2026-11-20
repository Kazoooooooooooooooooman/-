# Soto Phone 3Dプリント用ケース（前面フレーム＋背面カバーの2分割、中は空洞）
import sys
from build123d import *

# 使い方：python3 soto_case.py 厚み [版]   版 = 392（3.92インチ・76×90mm、既定）／ 34（旧：3.4インチ正方形・71.4×71mm）
T = float(sys.argv[1]) if len(sys.argv) > 1 else 10.0   # 厚み
MODEL = sys.argv[2] if len(sys.argv) > 2 else "392"
if MODEL == "392":
    # EHUI の 3.92インチ AMOLED（1080×1240、縦長）。EHUI の参考外形は 73.15×87.2mm。
    # 表示部の寸法は対角 3.92インチと解像度の比から計算した推定値（約 65.4×75.1mm）。実物の図面で必ず直す。
    W, H = 76.0, 90.0
    SCR_W, SCR_H = 65.4, 75.1
else:
    W, H = 71.4, 71.0
    SCR_W, SCR_H = 61.6, 61.6
R = 10.0                    # 角の丸み
WALL, SKIN = 1.2, 1.0       # 側壁・前後の板の厚み
SPLIT = T / 2               # 分割位置
SCR_R = 3.0                 # 画面の窓の角の丸み
GLASS_D = 0.8               # 窓の裏の段（カバーガラス・アクリル用）の深さ。段は窓より 1.2mm ずつ大きい
LIP, CLR = 0.8, 0.15        # はめ込みの立ち上がりと隙間

def rrect(w, h, r): return RectangleRounded(w, h, r)

def slab(w, h, r, z0, z1):
    with BuildPart() as p:
        with BuildSketch(Plane.XY.offset(z0)): rrect(w, h, r)
        extrude(amount=z1 - z0)
    return p.part

# --- 背面カバー（z = 0 .. SPLIT）
back = slab(W, H, R, 0, SPLIT) - slab(W - 2*WALL, H - 2*WALL, R - WALL, SKIN, SPLIT + 1)
cam = Pos(W/2 - 13, H/2 - 13, 0) * Cylinder(6.6, 10, align=(Align.CENTER, Align.CENTER, Align.MIN))
flash = Pos(W/2 - 24, H/2 - 11, 0) * Cylinder(1.6, 10, align=(Align.CENTER, Align.CENTER, Align.MIN))
back = back - Pos(0, 0, -1) * cam - Pos(0, 0, -1) * flash
POSTS = [(sx*(W/2 - WALL - 1.5), sy*(H/2 - 24)) for sx in (-1, 1) for sy in (-1, 1)]
for x, y in POSTS:
    back -= Pos(x, y, -1) * Cylinder(1.1, 10, align=(Align.CENTER, Align.CENTER, Align.MIN))        # M2 通し穴
    back -= Pos(x, y, -0.01) * Cylinder(2.1, 0.61, align=(Align.CENTER, Align.CENTER, Align.MIN))   # 頭の逃げ

# --- 前面フレーム（z = SPLIT .. T）
front = slab(W, H, R, SPLIT, T) - slab(W - 2*WALL, H - 2*WALL, R - WALL, SPLIT - 1, T - SKIN)
front -= slab(SCR_W, SCR_H, SCR_R, T - SKIN - 1, T + 1)                         # 画面の窓
front -= slab(SCR_W + 2.4, SCR_H + 2.4, SCR_R + 1, T - SKIN - 0.01, T - SKIN + GLASS_D)  # ガラス用の段
lw, lh = W - 2*WALL - 2*CLR, H - 2*WALL - 2*CLR                             # はめ込みリップ
front += slab(lw, lh, R - WALL - CLR, SPLIT - 1.2, SPLIT) - slab(lw - 2*LIP, lh - 2*LIP, R - WALL - CLR - LIP, SPLIT - 2, SPLIT + 0.1)
for x, y in POSTS:                                                           # ネジ受けの柱（M2 下穴）
    post = Pos(x, y, SKIN + 0.3) * Cylinder(1.9, T - 2*SKIN - 0.3, align=(Align.CENTER, Align.CENTER, Align.MIN))
    front += post
    front -= Pos(x, y, SKIN) * Cylinder(0.8, T - 2*SKIN - 0.4, align=(Align.CENTER, Align.CENTER, Align.MIN))
front -= slab(SCR_W - 0.01, SCR_H - 0.01, SCR_R, T - SKIN - 0.5, T + 1)          # 柱が窓にかからないよう再度抜く

# --- 側面ボタン（正面から見て右側）と USB-C（下側）
def side_slot(y, length):
    return Pos(W/2, y, T/2) * Box(6, length, 2.0)
def usb():
    return Pos(0, -H/2, T/2) * Rot(90, 0, 0) * slab(9.4, min(3.4, T - 2*SKIN - 0.4), 1.4, -3, 3)
for cut in (side_slot(H/2 - 20, 12), side_slot(H/2 - 36, 9), usb()):
    back -= cut; front -= cut

tag = (f"{T:.1f}mm".replace('.', '_')) if MODEL != "392" else f"76x90-{T:.1f}mm".replace('.', '_')
export_stl(back, f"soto-back-{tag}.stl"); export_stl(front, f"soto-front-{tag}.stl")
export_step(Compound([back, front]), f"soto-case-{tag}.step")
for n, p in (("back", back), ("front", front)):
    bb = p.bounding_box(); print(n, round(bb.size.X, 2), round(bb.size.Y, 2), round(bb.size.Z, 2), "vol", round(p.volume, 1), "valid", p.is_valid)

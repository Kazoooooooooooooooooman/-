# Soto Phone 試作ケース：酷派 小方块（Coolpad）用。前面フレーム＋背面カバーの2分割、M2ネジ4本で留める。
#
# 使い方：
#   python3 coolpad_case.py wrap        # 案A：小方块を分解せず、丸ごと中に入れる（推奨）
#   python3 coolpad_case.py parts       # 案B：分解して、画面と基板だけを入れる
# 数字は下の「実測値」を書き換える。単位は mm。測った値を入れると、すき間（CLR）が自動で足される。
import sys
from build123d import *

MODE = sys.argv[1] if len(sys.argv) > 1 else "wrap"

# ===== 実測値（現地でノギスで測って、ここだけ書き換える） =====
if MODE == "wrap":
    # 案A：小方块の本体そのもの。公開値 78.4 x 78.4 x 8.5（GSMChoice）。実物で必ず確認する
    PART_W, PART_H, PART_T = 78.4, 78.4, 8.5
    PART_R = 9.0            # 本体の角の丸み（推定）
    VIEW_W, VIEW_H = 72.0, 72.0   # 前面の窓：画面が見える範囲。3.95インチ正方形の表示部は約71mm角（計算値）
else:
    # 案B：分解して取り出した中身を重ねた外形（画面モジュール＋基板＋電池）
    PART_W, PART_H, PART_T = 74.0, 74.0, 7.0   # ← 仮の値。必ず実測で置き換える
    PART_R = 6.0
    VIEW_W, VIEW_H = 71.0, 71.0

# 穴の位置（仮の値。実物を見て直す）。原点は本体の中心、+Y が上、+X が右
CAM_X, CAM_W = 26.0, 22.0       # 上の辺の、回転カメラ用の切り欠き：中心のX位置と幅
USB_X, USB_W, USB_H = 0.0, 12.0, 5.0      # 下の辺の USB-C 穴
# ボタンの配置は iKKO MindOne の公開レビューに合わせる（小方块は同じ設計がもとと報道されている）：
#   右側面の上半分に、音量の上下＋電源（指紋）、その下にシャッター。上の辺の左寄りに AI キー。
#   正確な mm は公開されていないので推定。実物で必ず確認して直す。
BTN_Y, BTN_L = 8.0, 46.0        # 右側面の長穴：中心のY位置（上が＋）と長さ。音量・電源・シャッターをまとめて押せる
AIKEY_X, AIKEY_W = -22.0, 12.0  # 上の辺、左寄りの AI キー用の穴

# ===== ケースの決まりごと（ふつうは変えない） =====
CLR = 0.4        # 部品とケースのすき間（片側）。3Dプリントの誤差を吸収する
WALL = 1.6       # 側壁の厚み
SKIN = 1.2       # 前面・背面の板の厚み
LIP = 1.5        # 前面の窓のふち（部品を前から押さえる幅）
R_OUT = 10.0

IN_W, IN_H, IN_T = PART_W + 2*CLR, PART_H + 2*CLR, PART_T + 2*CLR
W, H, T = IN_W + 2*WALL, IN_H + 2*WALL, IN_T + 2*SKIN
SPLIT = SKIN + IN_T * 0.5
VIEW_W = min(VIEW_W, IN_W - 2*LIP); VIEW_H = min(VIEW_H, IN_H - 2*LIP)

def slab(w, h, r, z0, z1):
    with BuildPart() as p:
        with BuildSketch(Plane.XY.offset(z0)): RectangleRounded(w, h, r)
        extrude(amount=z1 - z0)
    return p.part

r_in = max(PART_R + CLR, 1.0)
cavity = slab(IN_W, IN_H, r_in, SKIN, SKIN + IN_T)
shell = slab(W, H, R_OUT, 0, T) - cavity
shell -= slab(VIEW_W, VIEW_H, 3.0, T - SKIN - 1, T + 1)                       # 前面の窓

# 切り欠き・穴（全体に開けてから前後に分ける）
cuts = [
    Pos(CAM_X, H/2, SPLIT) * Box(CAM_W, 2*WALL + 2, T + 2),                    # 回転カメラ：上の辺を前から後ろまで開ける
    Pos(USB_X, -H/2, SKIN + IN_T/2) * Box(USB_W, 2*WALL + 2, USB_H),           # USB-C
    Pos( W/2, BTN_Y, SKIN + IN_T/2) * Box(2*WALL + 2, BTN_L, min(4.0, IN_T - 1)),  # 右のボタン
    Pos(AIKEY_X, H/2, SKIN + IN_T/2) * Box(AIKEY_W, 2*WALL + 2, min(4.0, IN_T - 1)),  # 上の辺の AI キー
]
for c in cuts: shell -= c

# 前後のはめ込み：側壁の厚みの中だけで段をつける（中の本体とは絶対にぶつからない）
# 背面カバーの壁の外側半分を、分割位置から上に 3mm 立ち上げ、前面フレームの壁の外側半分をその分だけ削る
SKIRT_H, HALF, FIT = 3.0, WALL/2, 0.12
big = Box(400, 400, 400)
lower = shell & (Pos(0, 0, SPLIT - 200) * big)
upper = shell & (Pos(0, 0, SPLIT + 200) * big)
ring = slab(W, H, R_OUT, SPLIT, SPLIT + SKIRT_H) - slab(W - 2*HALF, H - 2*HALF, R_OUT - HALF, SPLIT - 1, SPLIT + SKIRT_H + 1)
ring_gap = slab(W + 2, H + 2, R_OUT, SPLIT - 0.01, SPLIT + SKIRT_H + FIT) - slab(W - 2*HALF - 2*FIT, H - 2*HALF - 2*FIT, R_OUT - HALF - FIT, SPLIT - 1, SPLIT + SKIRT_H + 2)
back = lower + (upper & ring)
front = upper - ring_gap
# ボスが部品とぶつかるか確認（ぶつかる量を表示する）
part_box = slab(PART_W, PART_H, PART_R, SKIN + CLR, SKIN + CLR + PART_T)
clash = sum(((front + back) & part_box).volume for _ in [0])

tag = f"coolpad-{MODE}"
export_stl(front, f"{tag}-front.stl"); export_stl(back, f"{tag}-back.stl")
export_step(Compound([front, back]), f"{tag}.step")
print(f"外形 {W:.1f} x {H:.1f} x {T:.1f} mm / 内側 {IN_W:.1f} x {IN_H:.1f} x {IN_T:.1f} / 窓 {VIEW_W:.1f} x {VIEW_H:.1f}")
print("部品と干渉する体積(mm3):", round(clash, 2))
for n, p in (("front", front), ("back", back)):
    bb = p.bounding_box(); print(n, round(bb.size.X,1), round(bb.size.Y,1), round(bb.size.Z,1), "valid", p.is_valid)
print("前後の部品どうしの重なり(mm3):", round((front & back).volume, 3))
print("部品の数（1ならつながっている）: front", len(front.solids()), "back", len(back.solids()))

Soto Phone 3Dプリント用ケース（試作）

ファイル
- soto-front-7_7mm.stl / soto-back-7_7mm.stl : 今のデザインの寸法（71.4 x 71.0 x 7.7 mm）
- soto-front-10_0mm.stl / soto-back-10_0mm.stl : 部品を入れやすい厚め版（71.4 x 71.0 x 10.0 mm）
- soto-case-*.step : 同じ形のSTEP（CAD・Fusionで開ける）

構造
- 前面フレーム（画面の窓付き）と背面カバーの2つに分かれる。中は空洞。
- 画面の窓 61.6 x 61.6 mm（3.4インチ正方形）。窓の裏に 64 x 64 mm、深さ0.8mm の段（カバーガラス・アクリル板用）。
- 前後の板 1.0mm、側壁 1.2mm。
- 中の空間：7.7mm版 約 69 x 68.6 x 5.7 mm ／ 10mm版 約 69 x 68.6 x 8.0 mm（ネジ柱の分は除く）。
- はめ込みのリップ（隙間0.15mm）＋ M2ネジ4本（背面から、長さ 7.7mm版は4mm前後・10mm版は6mm前後）。
- 背面カメラ穴 直径13.2mm、ライト穴 直径3.2mm。
- 右側面にボタン穴2つ（長さ12mm・9mm、高さ2mm）、下側にUSB-C穴（9.4 x 3.4mm）。

印刷のおすすめ
- 光造形（SLA/DLP）かMJF（ナイロン）。0.15mmの隙間は、FDMだと合わないことがある。
- 前面フレームは画面側を下にして印刷。

--- 2026-11-20 追加：76×90mm 版（EHUI 3.92インチ AMOLED 用） ---
soto-front-76x90-8_0mm.stl / soto-back-76x90-8_0mm.stl   厚み8mm
soto-front-76x90-10_0mm.stl / soto-back-76x90-10_0mm.stl 厚み10mm（部品を入れやすい）
soto-case-76x90-*.step  CAD で直すとき用
soto-case-76x90-drawing.pdf  寸法図
画面窓 65.4×75.1mm は、対角3.92インチと解像度1080×1240から計算した推定値。実物のパネル図面で直すこと。
作り直し：python3 soto_case.py 10 392

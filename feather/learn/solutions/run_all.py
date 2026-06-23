#!/usr/bin/env python3
"""Day 7 参考解答 — パイプライン一括実行。
データ生成 → 集計/図 → レポート生成 を1コマンドで再生成する。
実行: python3 solutions/run_all.py   (learn ディレクトリから)
"""
import subprocess, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))          # solutions/
LEARN = os.path.dirname(HERE)                              # learn/

steps = [
    (LEARN, "generate_data.py"),   # quality.db を再生成(決定論的)
    (HERE,  "day5.py"),            # 集計 + PNG(out_*.png)
    (HERE,  "report.py"),          # my_report.md を生成
]
for cwd, script in steps:
    print(f"\n===== running {script} =====")
    r = subprocess.run([sys.executable, os.path.join(cwd, script)], cwd=cwd)
    if r.returncode != 0:
        sys.exit(f"failed: {script}")
print("\n✅ done — open solutions/my_report.md")

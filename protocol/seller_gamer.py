"""売り手の例: ゲーマーの操作ログ（特徴量ベクトル）を出品する。"""

import random
import time

import adp

s = adp.connect("adp_live_gamer_7f3a", schema="controller.v2")

while True:
    vector = [round(random.uniform(-1, 1), 3) for _ in range(16)]  # 本物ならゲームの操作から計算する
    rid = s.publish(vector, floor_usd=10, meta={"game": "fighting", "rank": "top1%"})
    print(f"送信: {rid}  {vector[:4]}…")
    time.sleep(2)

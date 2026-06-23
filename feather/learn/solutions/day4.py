#!/usr/bin/env python3
"""Day 4 解答(統計の Python 分) — 相関・zスコア・異常検知
実行: python3 solutions/day4.py   (learn ディレクトリから)
"""
import sqlite3, os
import pandas as pd

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
con = sqlite3.connect(os.path.join(HERE, "quality.db"))

print("=" * 60, "\n3-4. 相関(time_spent / num_segments と quality)")
df = pd.read_sql("""
  SELECT an.time_spent_sec, an.num_segments, ad.quality_score
  FROM annotations an JOIN audits ad ON ad.annotation_id = an.annotation_id
""", con)
print(df.corr(numeric_only=True).round(3))
print("""
解釈の型: time_spent と quality の相関が弱い/正なら、
「単純に時間が短い=低品質」とは言い切れない。スキルや難易度の効きを別途見るべき。
(相関≠因果。仮説の出発点として扱う)""")

print("=" * 60, "\n5/7. アノテーター別サマリ + zスコア(要研修リスト)")
g = pd.read_sql("""
  SELECT a.name,
         COUNT(*) AS n,
         AVG(ad.quality_score) AS avg_q,
         AVG(an.time_spent_sec) AS avg_t,
         100.0*SUM(ad.verdict='rejected')/COUNT(*) AS reject_pct
  FROM annotations an
  JOIN annotators a ON a.annotator_id = an.annotator_id
  JOIN audits ad    ON ad.annotation_id = an.annotation_id
  GROUP BY a.annotator_id
  HAVING COUNT(*) >= 5
""", con)
mu, sd = g.avg_q.mean(), g.avg_q.std()
g["z"] = (g.avg_q - mu) / sd
g = g.round({"avg_q": 1, "avg_t": 0, "reject_pct": 1, "z": 2})
print(f"team mean={mu:.1f}  sd={sd:.1f}\n")
print(g.sort_values("avg_q").to_string(index=False))

print("\n>>> 要研修リスト (z < -1: 平均より目立って低い):")
print(g[g.z < -1].sort_values("z")[["name", "n", "avg_q", "avg_t", "reject_pct", "z"]]
      .to_string(index=False))

print("""
8. 「平均より低い」だけで決めない理由:
   - n(母数)が小さいと、低い平均が偶然の可能性。HAVING COUNT>=5 で足切り済み。
   - ばらつき(sd)を踏まえた z スコアで「どれだけ異常か」を測る。
   - z<-2 は明確な外れ値、z<-1 は要注意。施策(再研修)は根拠付きで選ぶ。""")
con.close()

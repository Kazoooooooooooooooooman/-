#!/usr/bin/env python3
"""Day 5 解答 — pandas で集計 + 可視化(PNG出力)
実行: python3 solutions/day5.py   (learn ディレクトリから)
出力: solutions/out_*.png と、コンソールにサマリ表
"""
import sqlite3, os
import pandas as pd
import matplotlib
matplotlib.use("Agg")               # 画面が無くてもPNG保存できる
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.dirname(os.path.abspath(__file__))
con = sqlite3.connect(os.path.join(HERE, "quality.db"))


def save(fig, name):
    path = os.path.join(OUT, name)
    fig.tight_layout(); fig.savefig(path, dpi=120); plt.close(fig)
    print("  saved", name)


# 1. describe サマリ
print("=" * 60, "\n1. quality_score サマリ")
print(pd.read_sql("SELECT quality_score FROM audits", con).describe().round(1))

# 2. アノテーター別ランキング(Day3 本命の pandas 版)
print("=" * 60, "\n2. アノテーター別サマリ(品質昇順)")
g = pd.read_sql("""
  SELECT a.name,
         COUNT(*) AS n,
         AVG(ad.quality_score) AS avg_q,
         AVG(an.time_spent_sec) AS avg_t,
         100.0*SUM(ad.verdict='rejected')/COUNT(*) AS reject_pct
  FROM annotations an
  JOIN annotators a ON a.annotator_id = an.annotator_id
  JOIN audits ad    ON ad.annotation_id = an.annotation_id
  GROUP BY a.annotator_id HAVING COUNT(*) >= 5
""", con).round({"avg_q": 1, "avg_t": 0, "reject_pct": 1})
print(g.sort_values("avg_q").to_string(index=False))

# 3. 難易度別 平均±標準偏差 → 棒グラフ
diff = pd.read_sql("""
  SELECT t.difficulty, ad.quality_score
  FROM annotations an
  JOIN tasks t ON t.task_id = an.task_id
  JOIN audits ad ON ad.annotation_id = an.annotation_id
""", con)
d = diff.groupby("difficulty")["quality_score"].agg(["mean", "std"]).round(1)
d = d.reindex(["easy", "medium", "hard"])
fig = plt.figure(figsize=(6, 4))
plt.bar(d.index, d["mean"], yerr=d["std"], capsize=6, color="#6366f1")
plt.title("Avg quality by difficulty (±std)"); plt.ylabel("quality_score")
save(fig, "out_difficulty.png")

# 4. 品質ヒストグラム
q = pd.read_sql("SELECT quality_score FROM audits", con)
fig = plt.figure(figsize=(7, 4))
plt.hist(q.quality_score, bins=15, edgecolor="white", color="#94a3b8")
plt.axvline(q.quality_score.mean(), color="red", linestyle="--", label="mean")
plt.title("Quality score distribution"); plt.xlabel("score"); plt.ylabel("count"); plt.legend()
save(fig, "out_hist.png")

# 5. エラー種別 棒グラフ
err = pd.read_sql("""
  SELECT error_type, COUNT(*) n FROM audits
  WHERE error_type IS NOT NULL GROUP BY error_type ORDER BY n DESC
""", con)
fig = plt.figure(figsize=(8, 4))
plt.bar(err.error_type, err.n, color="#f59e0b")
plt.title("Errors by type"); plt.ylabel("count"); plt.xticks(rotation=30, ha="right")
save(fig, "out_errors.png")

# 6. 作業時間 × 品質 散布図(rusher可視化)
fig = plt.figure(figsize=(7, 5))
plt.scatter(g.avg_t, g.avg_q, s=60, color="#0ea5e9")
for _, r in g.iterrows():
    plt.annotate(r["name"], (r.avg_t, r.avg_q), fontsize=8, xytext=(4, 4),
                 textcoords="offset points")
plt.axhline(g.avg_q.mean(), color="gray", linestyle=":", linewidth=1)
plt.axvline(g.avg_t.mean(), color="gray", linestyle=":", linewidth=1)
plt.xlabel("avg time spent (s)"); plt.ylabel("avg quality")
plt.title("Time vs Quality  (low quality + low time = rusher)")
save(fig, "out_scatter.png")

# 7. zスコアによる要研修リスト
mu, sd = g.avg_q.mean(), g.avg_q.std()
g["z"] = ((g.avg_q - mu) / sd).round(2)
print("=" * 60, "\n7. 要研修リスト (z < -1)")
print(g[g.z < -1].sort_values("z")[["name", "n", "avg_q", "reject_pct", "z"]].to_string(index=False))

con.close()
print("\nPNG は solutions/ に出力されました。")

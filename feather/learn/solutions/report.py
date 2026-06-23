#!/usr/bin/env python3
"""Day 7 参考解答 — KPIを計算して my_report.md を自動生成する capstone。
実行: python3 solutions/report.py   (learn ディレクトリから)
依存: 先に day5.py を実行して PNG を作っておくと図リンクが活きる。
出力: solutions/my_report.md
"""
import sqlite3, os, datetime as dt
import pandas as pd

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.dirname(os.path.abspath(__file__))
con = sqlite3.connect(os.path.join(HERE, "quality.db"))

# --- KPI 計算 ---
audits = pd.read_sql("SELECT * FROM audits", con)
total = len(audits)
reject_pct = 100 * (audits.verdict == "rejected").mean()
approve_pct = 100 * (audits.verdict == "approved").mean()
avg_q = audits.quality_score.mean()

g = pd.read_sql("""
  SELECT a.name, COUNT(*) n, AVG(ad.quality_score) avg_q,
         AVG(an.time_spent_sec) avg_t,
         SUM(ad.verdict='rejected') rej
  FROM annotations an
  JOIN annotators a ON a.annotator_id=an.annotator_id
  JOIN audits ad    ON ad.annotation_id=an.annotation_id
  GROUP BY a.annotator_id HAVING COUNT(*)>=5
""", con).sort_values("avg_q")
bottom3 = g.head(3)
total_rej = g.rej.sum()
bottom3_contrib = 100 * bottom3.rej.sum() / total_rej if total_rej else 0

errs = pd.read_sql("""
  SELECT error_type, COUNT(*) n FROM audits
  WHERE error_type IS NOT NULL GROUP BY error_type ORDER BY n DESC
""", con)
top_errs = ", ".join(f"{r.error_type}({r.n})" for _, r in errs.head(3).iterrows())

diff = pd.read_sql("""
  SELECT t.difficulty, AVG(ad.quality_score) q
  FROM annotations an JOIN tasks t ON t.task_id=an.task_id
  JOIN audits ad ON ad.annotation_id=an.annotation_id
  GROUP BY t.difficulty
""", con).set_index("difficulty").q
hard_gap = diff.get("hard", 0) - diff.get("medium", 0)

# --- レポート生成 ---
md = f"""# 週次 品質レポート(自動生成)— {dt.date.today()}

## TL;DR
- 棄却率は **{reject_pct:.0f}%**(目標 20%)。棄却の **{bottom3_contrib:.0f}%** が下位3名に集中。
- 下位3名({", ".join(bottom3.name)})への再研修で棄却率の大幅改善が見込める。
- hard タスクの品質は medium 比 **{hard_gap:+.1f}pt**。難易度配分の見直しを提案。

## 1. 現状KPI
| KPI | 今週 | 目標 | 状態 |
|---|---|---|---|
| 棄却率 | {reject_pct:.0f}% | 20% | {"🔴" if reject_pct>25 else "🟡" if reject_pct>20 else "🟢"} |
| 平均品質スコア | {avg_q:.1f} | 80 | {"🔴" if avg_q<70 else "🟡" if avg_q<80 else "🟢"} |
| 一発承認率 | {approve_pct:.0f}% | 70% | {"🔴" if approve_pct<50 else "🟡" if approve_pct<70 else "🟢"} |
| 下位3名の棄却寄与度 | {bottom3_contrib:.0f}% | — | — |

## 2. Root-cause
1. 品質下位3名: {", ".join(f"{r['name']}(q={r.avg_q:.0f}, rej={r.rej})" for _, r in bottom3.iterrows())}
2. エラー種別 TOP3: {top_errs} ← 研修/ガイド改善の対象
3. 難易度別品質: {", ".join(f"{k}={v:.1f}" for k, v in diff.items())}(相関であり因果断定はしない)

## 3. 提案アクション
1. [品質チーム] 下位3名に重点再研修(今週)
2. [ガイド担当] 最多エラー「{errs.iloc[0].error_type}」をガイドラインに明記(来週)
3. [配分担当] hard タスクは senior 優先配分(即時)

## 付録:図表
out_hist.png / out_scatter.png / out_errors.png / out_difficulty.png
"""
path = os.path.join(OUT, "my_report.md")
with open(path, "w") as f:
    f.write(md)
con.close()
print("generated", path)
print("\n--- preview ---\n" + md)

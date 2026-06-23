# Day 5 — pandas:自動化と可視化

> 🎯 今日のゴール:SQLでやった集計を Python(pandas)で再現し、**グラフ**にする。
> 「毎回手で叩く」を「スクリプト1本で出る」に変える。
>
> 🏢 Mercorでの意味:*"leveraging LLMs, databases, and scripting"*(求人票)。
> 週次の品質レポートを**自動生成**できれば、君は「手作業する人」から「仕組みを作る人」になる。
> これがオペPMの価値の源泉。

所要:5時間。`pandas` と `matplotlib` を使う(`pip install pandas matplotlib`)。

---

## 1. pandas の基本 — SQLとの対応で覚える

pandas の `DataFrame` は「Pythonで扱える表」。SQLと発想は同じ。

```python
import pandas as pd, sqlite3
con = sqlite3.connect("quality.db")

# SQL の結果をそのまま DataFrame に(これが一番ラク)
df = pd.read_sql("SELECT * FROM audits", con)

df.head()        # 先頭5行(SELECT * ... LIMIT 5)
df.shape         # (行数, 列数)
df.columns       # 列名一覧
df.describe()    # 数値列の統計サマリ(count/mean/std/min/max/分位点)を一発で
```

> 💡 `df.describe()` は神。**平均もばらつきも分位点も一行で出る**(Day4の統計が全部入り)。

### SQL ⇔ pandas 対応表
| やりたいこと | SQL | pandas |
|---|---|---|
| 列選択 | `SELECT a,b` | `df[["a","b"]]` |
| 行絞り | `WHERE q<60` | `df[df.q < 60]` |
| 並べ替え | `ORDER BY q` | `df.sort_values("q")` |
| 集計 | `GROUP BY x` | `df.groupby("x")` |
| 件数 | `COUNT(*)` | `len(df)` / `.size()` |
| 平均 | `AVG(q)` | `df.q.mean()` |

---

## 2. groupby — pandas版 GROUP BY

```python
# 難易度別の平均品質と件数
tasks = pd.read_sql("""
  SELECT t.difficulty, ad.quality_score
  FROM annotations an
  JOIN tasks t  ON t.task_id = an.task_id
  JOIN audits ad ON ad.annotation_id = an.annotation_id
""", con)

summary = tasks.groupby("difficulty")["quality_score"].agg(["count","mean","std"]).round(1)
print(summary)
```

複数の集計を一度に:
```python
df.groupby("annotator_id").agg(
    n=("quality_score","count"),
    avg_q=("quality_score","mean"),
    avg_t=("time_spent_sec","mean"),
).round(1)
```

---

## 3. merge — pandas版 JOIN

```python
ann = pd.read_sql("SELECT * FROM annotations", con)
who = pd.read_sql("SELECT annotator_id, name, tier FROM annotators", con)
aud = pd.read_sql("SELECT annotation_id, quality_score, verdict FROM audits", con)

m = ann.merge(who, on="annotator_id").merge(aud, on="annotation_id")
# これで「作業 + 人 + 品質」が1つの表に
```

> 💡 実務のコツ:**重い結合や集計は SQL でやって、pandas には集計済みを渡す**と速い。
> pandas は「最後の仕上げ・可視化・微調整」に使うのが筋がいい。

---

## 4. 可視化 — グラフは「伝わる」の最短距離

```python
import matplotlib
matplotlib.use("Agg")          # 画面が無い環境でもファイル保存できる
import matplotlib.pyplot as plt

# 例: 品質スコアのヒストグラム(分布)
df = pd.read_sql("SELECT quality_score FROM audits", con)
plt.figure(figsize=(7,4))
plt.hist(df.quality_score, bins=15, edgecolor="white")
plt.axvline(df.quality_score.mean(), color="red", linestyle="--", label="mean")
plt.title("Quality score distribution"); plt.xlabel("score"); plt.ylabel("count")
plt.legend(); plt.tight_layout()
plt.savefig("out_hist.png", dpi=120)
```

よく使う3つの図:
- **ヒストグラム** `plt.hist` … 分布(品質の山がどこにあるか)
- **棒グラフ** `plt.bar` … カテゴリ比較(アノテーター別品質、エラー種別件数)
- **散布図** `plt.scatter` … 2変数の関係(作業時間 × 品質 → rusherが見える)

```python
# rusher を可視化する散布図(Day4 演習7の図版)
g = pd.read_sql("""
  SELECT a.name, AVG(an.time_spent_sec) t, AVG(ad.quality_score) q, COUNT(*) n
  FROM annotations an
  JOIN annotators a ON a.annotator_id=an.annotator_id
  JOIN audits ad ON ad.annotation_id=an.annotation_id
  GROUP BY a.annotator_id HAVING COUNT(*)>=5
""", con)
plt.figure(figsize=(7,5))
plt.scatter(g.t, g.q)
for _,r in g.iterrows():
    plt.annotate(r["name"], (r.t, r.q), fontsize=8)
plt.xlabel("avg time spent (s)"); plt.ylabel("avg quality")
plt.title("Time vs Quality (low-left = rusher?)")
plt.tight_layout(); plt.savefig("out_scatter.png", dpi=120)
```

---

## 演習(`solutions/day5.py` で答え合わせ)

スクリプトとして書き、実行したら表とPNGが出る形にする。

1. `audits` を読み込み、`df.describe()` で品質スコアの統計サマリを表示。
2. アノテーター別に `n / avg_q / avg_t / reject率` を `groupby+agg` で出し、品質昇順で表示。
   (Day3 のSQL本命を pandas で再現)
3. 難易度別の平均品質と標準偏差を出し、**棒グラフ**(`out_difficulty.png`)に。
4. 品質スコアの**ヒストグラム**を保存(平均線つき)。
5. エラー種別ごとの件数を**棒グラフ**に(`out_errors.png`)。多い順。
6. 「平均作業時間 × 平均品質」の**散布図**を作り、各点にアノテーター名を付けよ。
   → 🏢 図を見て「速くて低品質」の人を名指しできるか。
7. アノテーター別平均品質の z スコアを計算し、`z < -1` の要研修リストを表で出力。
8. 上記をすべて **`my_report.py`** という1ファイルにまとめ、`python3 my_report.py` で
   「サマリ表 + 4枚のPNG」が一気に出るようにせよ。→ これが Day6 の素材になる。

---

## 今日の振り返り

- SQL でやったことを pandas で再現できた? 2つの道具を**使い分け**られる?
- 散布図で rusher が「見えた」? **図は言葉より速く伝わる**ことを体感した?
- `my_report.py` を実行 → 成果物が自動で出る、という**仕組み化**ができた?

➡️ **[Day 6](day6.md)** へ。明日は、出した数字と図を**「成果の言葉」に翻訳**して1枚のレポートにする。

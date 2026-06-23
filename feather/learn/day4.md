# Day 4 — 統計:判断する

> 🎯 今日のゴール:平均だけでなく**ばらつき・分布・相関**で語れるようになる。
> 「品質が低い」を**「統計的にこう言える」**に格上げする。
>
> 🏢 Mercorでの意味:「Aさんの品質が低い」とだけ言うと「たまたまでは?」と返される。
> *"data-first approach with quantitative analytical ability"*(求人票)とは、
> **ばらつきと母数を踏まえて、自信を持って判断する力**のこと。

所要:4〜5時間。SQL と pandas の両方で確認する。

---

## 1. 平均は嘘をつく — だから「ばらつき」を見る

同じ平均70点でも、中身は全然違う:
- A: 全員 68〜72(安定)
- B: 半分が95、半分が45(バラバラ)

平均だけ見ると同じ。でもオペレーション上は**全く別の問題**。
だから**標準偏差(ばらつきの大きさ)**を必ずセットで見る。

```sql
-- SQLite には標準偏差の関数が無いので、定義通り計算する:
-- 分散 = 平均((x - 平均)^2),  標準偏差 = √分散
WITH m AS (SELECT AVG(quality_score) AS mu FROM audits)
SELECT
  ROUND((SELECT mu FROM m), 1)                              AS mean,
  ROUND(AVG((quality_score - (SELECT mu FROM m)) *
            (quality_score - (SELECT mu FROM m))), 1)        AS variance
FROM audits;
-- √variance が標準偏差。pandas なら df.quality_score.std() 一発。
```

> 実務では pandas の方が楽(`df.quality_score.std()`)。今日は両方やる。
> 大事なのは**「平均 ± 標準偏差」でデータの幅を語る**習慣。

---

## 2. 分布を見る — ヒストグラム的に束ねる

数字の「かたまり方」を見る。SQLでも階級に分ければ分布が見える:

```sql
SELECT
  CASE
    WHEN quality_score >= 90 THEN '90-100'
    WHEN quality_score >= 80 THEN '80-89'
    WHEN quality_score >= 70 THEN '70-79'
    WHEN quality_score >= 60 THEN '60-69'
    ELSE '< 60'
  END AS band,
  COUNT(*) AS n
FROM audits
GROUP BY band
ORDER BY band DESC;
```

🏢 これは「品質スコアの分布」。山が左(低い方)に寄っていたら、チーム全体の問題。
特定の人だけ低いなら、個人の問題。**どこに手を打つかが変わる。**

---

## 3. 中央値・分位点 — 外れ値に強い代表値

平均は極端な値に引っ張られる。**中央値(50%点)**は引っ張られにくい。

```sql
-- 中央値(SQLite): 並べてちょうど真ん中
WITH ordered AS (
  SELECT quality_score, ROW_NUMBER() OVER (ORDER BY quality_score) AS rn,
         COUNT(*) OVER () AS cnt
  FROM audits
)
SELECT ROUND(AVG(quality_score),1) AS median
FROM ordered
WHERE rn IN ((cnt+1)/2, (cnt+2)/2);
```

> 💡 平均 ≫ 中央値 なら「一部の高得点が平均を押し上げている」。
> 平均 ≪ 中央値 なら「一部の低得点が足を引っ張っている」。**ズレ自体が情報。**

---

## 4. 相関 vs 因果 — 一番大事で一番間違える

**相関**:2つの数字が一緒に動く(例:作業時間が短い ⇔ 品質が低い)。
**因果**:片方がもう片方を**引き起こす**。

⚠️ **相関は因果ではない。** 「時間が短い人は品質が低い」が見えても、
「急がせれば品質が下がる」とは限らない(スキルが低い人が、たまたま速い、かもしれない)。

それでも、相関は**仮説の出発点**として極めて重要。今日はこれを数値で確認する:

```python
# pandas で相関係数(-1〜+1, 0は無相関)
import pandas as pd, sqlite3
con = sqlite3.connect("quality.db")
df = pd.read_sql("""
  SELECT an.time_spent_sec, ad.quality_score
  FROM annotations an JOIN audits ad ON ad.annotation_id=an.annotation_id
""", con)
print(df.corr(numeric_only=True))   # time_spent と quality の相関
```

🏢 もし負でない/弱い相関なら、「時間」より「スキル」や「難易度」が効いている可能性。
**root-cause は1つの相関で決めず、複数の角度で詰める。** これがプロの作法。

---

## 5. 異常検知の超入門 — 「平均から離れている人」

シンプルな方法:**チーム平均から標準偏差の2倍以上離れた人**を「要注意」とする。

```python
import pandas as pd, sqlite3
con = sqlite3.connect("quality.db")
g = pd.read_sql("""
  SELECT a.name, AVG(ad.quality_score) q, COUNT(*) n
  FROM annotations an
  JOIN annotators a ON a.annotator_id=an.annotator_id
  JOIN audits ad ON ad.annotation_id=an.annotation_id
  GROUP BY a.annotator_id HAVING COUNT(*)>=5
""", con)
mu, sd = g.q.mean(), g.q.std()
g["z"] = (g.q - mu) / sd                    # 標準化スコア(平均からの距離)
print(g[g.z < -1].sort_values("z"))          # 平均より大きく低い人 = 要研修
```

> `z`(zスコア)= 平均から標準偏差何個分離れているか。
> `z < -1` は「下位の目立つ人」、`z < -2` は「明確な外れ値」。
> 🏢 これが *"systems to evaluate auditor performance"*(求人票)の最小実装。

---

## 演習(SQL は `solutions/day4.sql`、Python は `solutions/day4.py`)

1. 品質スコアの平均と、5点刻みでなく上記の「バンド別件数」(分布)を出せ。
2. 品質スコアの中央値を出し、平均と比べよ。どちらが高い? それは何を意味する?
3. (pandas)`time_spent_sec` と `quality_score` の相関係数を出せ。符号と強さを解釈せよ。
4. (pandas)`num_segments` と `quality_score` の相関は? 作業量と品質に関係はあるか。
5. (pandas)アノテーター別平均品質の z スコアを出し、`z < -1` の「要研修リスト」を作れ。
6. 難易度別に品質スコアの**平均と分布**を出し、「hardは平均が低いだけか、ばらつきも大きいか」を述べよ。
7. (pandas)アノテーター別に「平均品質」と「平均作業時間」を出し、散布図用の表を作れ
   (Day5で図にする)。**速い×低品質の象限に誰がいるか**を見つけよ。
8. 「平均より低い」だけで再研修を決めるのが危険な理由を、**母数(n)とばらつき**の観点で説明せよ。

---

## 今日の振り返り(言語化が今日の本体)

- 「Aさんは品質が低い」を、**平均・ばらつき・母数・zスコア**を使って言い直せる?
- 相関を見つけても因果と断定しない理由を、自分の例で説明できる?
- 演習5の「要研修リスト」は、そのまま施策(再研修)に繋がる。**誰を・なぜ**選んだか言える?

➡️ **[Day 5](day5.md)** へ。明日は pandas で全部を自動化し、**グラフ**にする。

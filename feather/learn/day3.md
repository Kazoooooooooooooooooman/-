# Day 3 — SQL中級:関係と順位

> 🎯 今日のゴール:`JOIN`(テーブル結合)、`WITH`(CTE)、ウィンドウ関数。
> 「アノテーター × 品質 × タスク」を繋いで、**ランキングや累積**を作る。
>
> 🏢 Mercorでの意味:現実のデータは複数テーブルに分かれている。
> 「**誰が・どのタスクで・どんな品質だったか**」を一つの表に束ねられて初めて、root-cause分析ができる。
> ウィンドウ関数まで使えると「SQLができる人」として明確に通用する。

所要:5〜6時間。今日が SQL の山場。

---

## 1. JOIN — テーブルを繋ぐ

データが分かれている理由:`audits` には品質はあるがアノテーター名がない。
名前は `annotators` にある。これを**共通のキーで繋ぐ**のが JOIN。

```sql
-- audit に、誰の作業かをくっつける
SELECT
  an.annotation_id,
  a.name,
  ad.quality_score,
  ad.verdict
FROM annotations an
JOIN annotators a  ON a.annotator_id = an.annotator_id   -- 作業 ⇔ 人
JOIN audits      ad ON ad.annotation_id = an.annotation_id -- 作業 ⇔ レビュー
LIMIT 10;
```

読み方:`annotations` を軸に、`ON` の条件で他テーブルの行を横に連結する。
`an` `a` `ad` は**テーブルの別名**(長い名前を毎回書かないため)。

### INNER vs LEFT
- `JOIN`(= `INNER JOIN`):両方に存在する行だけ。
- `LEFT JOIN`:左テーブルは全部残し、右に無ければ NULL。

```sql
-- 全アノテーターを残し、作業が無い人も NULL で表示
SELECT a.name, COUNT(an.annotation_id) AS n
FROM annotators a
LEFT JOIN annotations an ON an.annotator_id = a.annotator_id
GROUP BY a.annotator_id;
```

> 💡 「**この人、1件も作業してない**」を見つけたいなら LEFT JOIN。INNER だと消えてしまう。

---

## 2. JOIN + GROUP BY — ついに「アノテーター別の品質」

Day2 でできなかった本命がこれ:

```sql
SELECT
  a.name,
  a.tier,
  COUNT(*)                     AS n,
  ROUND(AVG(ad.quality_score),1) AS avg_quality,
  ROUND(100.0*SUM(ad.verdict='rejected')/COUNT(*),1) AS reject_pct,
  ROUND(AVG(an.time_spent_sec),0) AS avg_time
FROM annotations an
JOIN annotators a  ON a.annotator_id  = an.annotator_id
JOIN audits      ad ON ad.annotation_id = an.annotation_id
GROUP BY a.annotator_id
HAVING COUNT(*) >= 5
ORDER BY avg_quality ASC;          -- ワーストから
```

🏢 **これが Quality PM の中核クエリ。** 「再研修すべきアノテーターは誰か」が一発で出る。
このデータでは、`avg_quality` が低い人ほど `reject_pct` が高く、しかも `avg_time` が短い
=「**速いのに雑(rusher)**」という root-cause が見えるはず。これを発見できたら今日は勝ち。

---

## 3. CTE(WITH句)— クエリを部品に分ける

複雑なクエリを「名前付きの中間テーブル」に分けて読みやすくする。

```sql
WITH annotator_stats AS (
  SELECT
    an.annotator_id,
    AVG(ad.quality_score) AS avg_q,
    COUNT(*) AS n
  FROM annotations an
  JOIN audits ad ON ad.annotation_id = an.annotation_id
  GROUP BY an.annotator_id
)
SELECT a.name, ROUND(s.avg_q,1) AS avg_q, s.n
FROM annotator_stats s
JOIN annotators a ON a.annotator_id = s.annotator_id
WHERE s.n >= 5
ORDER BY s.avg_q;
```

> 💡 CTE は「サブクエリに名前をつけたもの」。長い分析は CTE で段階的に組むと、
> 自分でも後から読める・デバッグできる。**実務で必須の整理術。**

---

## 4. ウィンドウ関数 — 行を消さずに順位・累積を付ける

GROUP BY は行を**畳む**。ウィンドウ関数は行を**残したまま**計算を足す。

```sql
WITH stats AS (
  SELECT an.annotator_id,
         ROUND(AVG(ad.quality_score),1) AS avg_q,
         COUNT(*) AS n
  FROM annotations an
  JOIN audits ad ON ad.annotation_id = an.annotation_id
  GROUP BY an.annotator_id
  HAVING COUNT(*) >= 5
)
SELECT
  a.name,
  s.avg_q,
  RANK()       OVER (ORDER BY s.avg_q DESC) AS quality_rank,  -- 品質ランキング
  ROUND(AVG(s.avg_q) OVER (), 1)            AS team_avg       -- チーム平均(全行に付く)
FROM stats s JOIN annotators a ON a.annotator_id = s.annotator_id
ORDER BY quality_rank;
```

主要なウィンドウ関数:
- `ROW_NUMBER()` … 1,2,3…(同点でも別番号)
- `RANK()` … 同点は同順位、次が飛ぶ(1,1,3)
- `LAG(列)` / `LEAD(列)` … 前/次の行の値(時系列の差分に)
- `AVG(列) OVER (...)` … グループ内平均を各行に付与

`OVER (PARTITION BY ...)` で「グループ内で」順位付けもできる:
```sql
-- 各国の中での品質ランキング
RANK() OVER (PARTITION BY a.country ORDER BY s.avg_q DESC)
```

---

## 演習(`solutions/day3.sql` で答え合わせ)

1. `annotations` に `annotators` を JOIN し、各作業の「作業ID・アノテーター名・作業時間」を10件表示。
2. annotations + audits を JOIN し、「作業ID・品質スコア・判定」を品質の低い順に10件。
3. **本命**:アノテーター別に `n / avg_quality / reject_pct / avg_time` を出し、
   5件以上に絞って品質の低い順に並べよ。→ rusher を見つけられるか?
4. `tasks` と JOIN して、**難易度別の平均品質スコア**を出せ(annotations経由)。
   → 🏢「hardはどれくらい品質が落ちるか」を数値化。
5. `language` 別の平均品質スコアと件数を出せ。→ 言語による品質差はあるか?
6. LEFT JOIN を使い、**作業件数が最も少ない(または0の)アノテーター**を見つけよ。
7. CTE を使って「アノテーター別の平均品質」を中間テーブルにし、
   チーム平均より**低い**アノテーターだけを表示せよ。
8. ウィンドウ関数 `RANK()` で、アノテーターを平均品質で順位付けせよ(5件以上)。
9. 各アノテーターの平均品質に、`AVG(...) OVER ()` でチーム平均を併記し、差分も出せ。
   → 🏢「平均から何点低いか」は研修優先度のスコアになる。
10. `error_type` 別に件数を出し、`RANK()` で多い順の順位を付けよ。

### 発展
- 11. `PARTITION BY country` で、国ごとの品質ランキングを作れ。
- 12. CTE を2段重ねて「rusher 候補」(avg_time が中央値未満 **かつ** avg_quality が下位)を抽出せよ。

---

## 今日の振り返り

- 演習3で **rusher(速くて雑な人)** を数字で名指しできた? それが root-cause 分析。
- JOIN・CTE・ウィンドウ関数の3つを、用途で説明できる?
  (JOIN=繋ぐ / CTE=部品化 / ウィンドウ=順位・累積)

➡️ **[Day 4](day4.md)** へ。明日は統計。「品質が低い」を**"統計的に有意に低い"**と言えるようにする。

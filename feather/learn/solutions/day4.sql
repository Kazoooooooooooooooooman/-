-- Day 4 解答(SQL分) — 分布・中央値
-- 実行: python3 sql.py solutions/day4.sql
-- ※ 相関・zスコアは Python が適切なので solutions/day4.py を参照

-- 1. 品質スコアの平均 + バンド別分布
SELECT ROUND(AVG(quality_score), 1) AS mean FROM audits;

SELECT
  CASE
    WHEN quality_score >= 90 THEN '90-100'
    WHEN quality_score >= 80 THEN '80-89'
    WHEN quality_score >= 70 THEN '70-79'
    WHEN quality_score >= 60 THEN '60-69'
    ELSE '< 60'
  END AS band,
  COUNT(*) AS n
FROM audits GROUP BY band ORDER BY band DESC;

-- 2. 中央値(並べて真ん中)+ 平均との比較
WITH ordered AS (
  SELECT quality_score,
         ROW_NUMBER() OVER (ORDER BY quality_score) AS rn,
         COUNT(*) OVER () AS cnt
  FROM audits
)
SELECT ROUND(AVG(quality_score), 1) AS median
FROM ordered WHERE rn IN ((cnt + 1) / 2, (cnt + 2) / 2);

-- 6. 難易度別の平均と「ばらつき」(分散)— hard は平均が低いだけかバラつくか
WITH base AS (
  SELECT t.difficulty, ad.quality_score
  FROM annotations an
  JOIN tasks t   ON t.task_id = an.task_id
  JOIN audits ad ON ad.annotation_id = an.annotation_id
),
mu AS (SELECT difficulty, AVG(quality_score) AS m FROM base GROUP BY difficulty)
SELECT b.difficulty,
       COUNT(*) AS n,
       ROUND(AVG(b.quality_score), 1) AS mean,
       ROUND(AVG((b.quality_score - mu.m) * (b.quality_score - mu.m)), 1) AS variance
FROM base b JOIN mu ON mu.difficulty = b.difficulty
GROUP BY b.difficulty ORDER BY mean;

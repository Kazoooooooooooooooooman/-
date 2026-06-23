-- Day 3 解答 — JOIN / CTE / ウィンドウ関数
-- 実行: python3 sql.py solutions/day3.sql

-- 1. 作業 + アノテーター名 + 作業時間
SELECT an.annotation_id, a.name, an.time_spent_sec
FROM annotations an JOIN annotators a ON a.annotator_id = an.annotator_id
LIMIT 10;

-- 2. 作業 + 品質 + 判定(品質低い順)
SELECT an.annotation_id, ad.quality_score, ad.verdict
FROM annotations an JOIN audits ad ON ad.annotation_id = an.annotation_id
ORDER BY ad.quality_score ASC LIMIT 10;

-- 3. 本命:アノテーター別の n / avg_quality / reject_pct / avg_time(rusher 発見)
SELECT a.name, a.tier,
  COUNT(*) AS n,
  ROUND(AVG(ad.quality_score), 1) AS avg_quality,
  ROUND(100.0 * SUM(ad.verdict = 'rejected') / COUNT(*), 1) AS reject_pct,
  ROUND(AVG(an.time_spent_sec), 0) AS avg_time
FROM annotations an
JOIN annotators a  ON a.annotator_id  = an.annotator_id
JOIN audits      ad ON ad.annotation_id = an.annotation_id
GROUP BY a.annotator_id HAVING COUNT(*) >= 5
ORDER BY avg_quality ASC;

-- 4. 難易度別の平均品質(tasks 経由)
SELECT t.difficulty, COUNT(*) AS n, ROUND(AVG(ad.quality_score), 1) AS avg_q
FROM annotations an
JOIN tasks  t  ON t.task_id = an.task_id
JOIN audits ad ON ad.annotation_id = an.annotation_id
GROUP BY t.difficulty ORDER BY avg_q;

-- 5. language 別の平均品質と件数
SELECT t.language, COUNT(*) AS n, ROUND(AVG(ad.quality_score), 1) AS avg_q
FROM annotations an
JOIN tasks  t  ON t.task_id = an.task_id
JOIN audits ad ON ad.annotation_id = an.annotation_id
GROUP BY t.language ORDER BY avg_q;

-- 6. LEFT JOIN で作業件数が少ない/0 のアノテーター
SELECT a.name, COUNT(an.annotation_id) AS n
FROM annotators a
LEFT JOIN annotations an ON an.annotator_id = a.annotator_id
GROUP BY a.annotator_id ORDER BY n ASC;

-- 7. CTE: チーム平均より低いアノテーター
WITH stats AS (
  SELECT an.annotator_id, AVG(ad.quality_score) AS avg_q, COUNT(*) AS n
  FROM annotations an JOIN audits ad ON ad.annotation_id = an.annotation_id
  GROUP BY an.annotator_id HAVING COUNT(*) >= 5
)
SELECT a.name, ROUND(s.avg_q, 1) AS avg_q, s.n
FROM stats s JOIN annotators a ON a.annotator_id = s.annotator_id
WHERE s.avg_q < (SELECT AVG(avg_q) FROM stats)
ORDER BY s.avg_q;

-- 8. ウィンドウ関数 RANK で品質ランキング
WITH stats AS (
  SELECT an.annotator_id, ROUND(AVG(ad.quality_score),1) AS avg_q, COUNT(*) AS n
  FROM annotations an JOIN audits ad ON ad.annotation_id = an.annotation_id
  GROUP BY an.annotator_id HAVING COUNT(*) >= 5
)
SELECT a.name, s.avg_q, RANK() OVER (ORDER BY s.avg_q DESC) AS quality_rank
FROM stats s JOIN annotators a ON a.annotator_id = s.annotator_id
ORDER BY quality_rank;

-- 9. 各アノテーターの平均品質 + チーム平均 + 差分(研修優先度スコア)
WITH stats AS (
  SELECT an.annotator_id, AVG(ad.quality_score) AS avg_q, COUNT(*) AS n
  FROM annotations an JOIN audits ad ON ad.annotation_id = an.annotation_id
  GROUP BY an.annotator_id HAVING COUNT(*) >= 5
)
SELECT a.name,
  ROUND(s.avg_q, 1) AS avg_q,
  ROUND(AVG(s.avg_q) OVER (), 1) AS team_avg,
  ROUND(s.avg_q - AVG(s.avg_q) OVER (), 1) AS diff_from_team
FROM stats s JOIN annotators a ON a.annotator_id = s.annotator_id
ORDER BY diff_from_team;

-- 10. error_type 別件数 + RANK
SELECT error_type, COUNT(*) AS n, RANK() OVER (ORDER BY COUNT(*) DESC) AS rnk
FROM audits WHERE error_type IS NOT NULL
GROUP BY error_type ORDER BY rnk;

-- 11. PARTITION BY country で国内ランキング
WITH stats AS (
  SELECT an.annotator_id, AVG(ad.quality_score) AS avg_q, COUNT(*) AS n
  FROM annotations an JOIN audits ad ON ad.annotation_id = an.annotation_id
  GROUP BY an.annotator_id HAVING COUNT(*) >= 5
)
SELECT a.country, a.name, ROUND(s.avg_q,1) AS avg_q,
  RANK() OVER (PARTITION BY a.country ORDER BY s.avg_q DESC) AS rank_in_country
FROM stats s JOIN annotators a ON a.annotator_id = s.annotator_id
ORDER BY a.country, rank_in_country;

-- 12. rusher 候補: 作業時間が中央値未満 かつ 品質が下位
WITH stats AS (
  SELECT an.annotator_id,
         AVG(ad.quality_score) AS avg_q,
         AVG(an.time_spent_sec) AS avg_t,
         COUNT(*) AS n
  FROM annotations an JOIN audits ad ON ad.annotation_id = an.annotation_id
  GROUP BY an.annotator_id HAVING COUNT(*) >= 5
),
mid AS (SELECT AVG(avg_t) AS t_threshold, AVG(avg_q) AS q_threshold FROM stats)
SELECT a.name, ROUND(s.avg_q,1) AS avg_q, ROUND(s.avg_t,0) AS avg_t
FROM stats s JOIN annotators a ON a.annotator_id = s.annotator_id, mid
WHERE s.avg_t < mid.t_threshold AND s.avg_q < mid.q_threshold
ORDER BY s.avg_q;

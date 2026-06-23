-- Day 2 解答 — GROUP BY / 集計 / CASE / HAVING
-- 実行: python3 sql.py solutions/day2.sql

-- 1. 全体の平均品質
SELECT ROUND(AVG(quality_score), 1) AS avg_quality FROM audits;

-- 2. verdict ごとの件数(多い順)
SELECT verdict, COUNT(*) AS n FROM audits GROUP BY verdict ORDER BY n DESC;

-- 3. 棄却率(%)— チーム最重要KPIの一つ
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN verdict = 'rejected' THEN 1 ELSE 0 END) AS rejected,
  ROUND(100.0 * SUM(CASE WHEN verdict = 'rejected' THEN 1 ELSE 0 END) / COUNT(*), 1) AS rejection_pct
FROM audits;

-- 4. 難易度別のタスク数と平均尺
SELECT difficulty, COUNT(*) AS n, ROUND(AVG(duration_sec), 1) AS avg_dur
FROM tasks GROUP BY difficulty ORDER BY n DESC;

-- 5. エラー種別ごとの件数(多い順、NULLは自然に除外)
SELECT error_type, COUNT(*) AS n FROM audits
WHERE error_type IS NOT NULL GROUP BY error_type ORDER BY n DESC;

-- 6. アノテーター別の作業件数(多い順)
SELECT annotator_id, COUNT(*) AS num_annotations
FROM annotations GROUP BY annotator_id ORDER BY num_annotations DESC;

-- 7. アノテーター別の平均作業時間(長い順)
SELECT annotator_id, ROUND(AVG(time_spent_sec), 0) AS avg_time
FROM annotations GROUP BY annotator_id ORDER BY avg_time DESC;

-- 8. language ごとのタスク数
SELECT language, COUNT(*) AS n FROM tasks GROUP BY language ORDER BY n DESC;

-- 9. 5件以上作業したアノテーター(HAVING で母数フィルタ)
SELECT annotator_id, COUNT(*) AS n
FROM annotations GROUP BY annotator_id HAVING COUNT(*) >= 5 ORDER BY n DESC;

-- 10. バッチごとのタスク数と hard 割合(%)
SELECT batch, COUNT(*) AS n,
  ROUND(100.0 * SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) / COUNT(*), 1) AS hard_pct
FROM tasks GROUP BY batch ORDER BY batch;

-- 11. verdict ごとの平均品質(閾値の確認)
SELECT verdict, ROUND(AVG(quality_score), 1) AS avg_q, COUNT(*) AS n
FROM audits GROUP BY verdict ORDER BY avg_q DESC;

-- 12. 難易度別の平均品質(タスク側 difficulty は別テーブルなので Day3 で JOIN するが、
--     ここでは audits 単体では出せないため、難易度をまたいだ品質は Day3 演習4 で完成させる)
--     → 代わりに「品質スコアの最小/最大/平均」を1行で確認しておく
SELECT ROUND(MIN(quality_score),1) AS min_q, ROUND(MAX(quality_score),1) AS max_q,
       ROUND(AVG(quality_score),1) AS avg_q FROM audits;

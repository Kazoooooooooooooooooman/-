-- Day 1 解答 — SELECT / WHERE / ORDER BY / LIMIT
-- 実行: python3 sql.py solutions/day1.sql   (各クエリの結果が順に表示される)

-- 1. annotators 全列
SELECT * FROM annotators;

-- 2. senior の名前と国
SELECT name, country FROM annotators WHERE tier = 'senior';

-- 3. hard タスクを尺の長い順
SELECT * FROM tasks WHERE difficulty = 'hard' ORDER BY duration_sec DESC;

-- 4. rejected を品質低い順に10件(最優先で再レビューすべき作業)
SELECT annotation_id, quality_score, verdict, error_type
FROM audits WHERE verdict = 'rejected'
ORDER BY quality_score ASC LIMIT 10;

-- 5. 品質スコア 50 未満
SELECT annotation_id, quality_score, verdict FROM audits
WHERE quality_score < 50 ORDER BY quality_score;

-- 6. error_type の種類(重複なし)
SELECT DISTINCT error_type FROM audits;

-- 7. video かつ hard
SELECT * FROM tasks WHERE media_type = 'video' AND difficulty = 'hard';

-- 8. 名前が Aki で始まる
SELECT * FROM annotators WHERE name LIKE 'Aki%';

-- 9. 作業時間トップ5(非効率 or 高難度の発見)
SELECT annotation_id, annotator_id, time_spent_sec
FROM annotations ORDER BY time_spent_sec DESC LIMIT 5;

-- 10. 指摘あり(error_type が NULL でない)を品質順に5件
SELECT annotation_id, quality_score, error_type FROM audits
WHERE error_type IS NOT NULL ORDER BY quality_score LIMIT 5;

-- 11. easy 以外を尺の短い順に5件
SELECT * FROM tasks WHERE difficulty != 'easy' ORDER BY duration_sec ASC LIMIT 5;

-- 12. 品質 80〜90 をスコア降順
SELECT annotation_id, quality_score FROM audits
WHERE quality_score BETWEEN 80 AND 90 ORDER BY quality_score DESC;

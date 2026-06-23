# feather Academy — データ分析 7日間ブートキャンプ

> 目的:**Mercor の Quality Program Manager** として通用する「データで品質を語れる力」を、
> 7日間で**手を動かして**身につける。題材は人間データ(アノテーション)の品質オペレーション
> ——つまり**その仕事そのもの**。

この教材は「読むだけ」では終わらせない。毎日、実際のデータベースに SQL を投げ、
Python で集計し、最後は**1枚の品質改善レポート**という"成果物"を作る。
それがそのまま面接で見せられるポートフォリオになる。

---

## なぜこの教材が Mercor で本当に効くのか

求人票の核心はこの3つ:
1. *"Develop technical solutions to auto-evaluate quality of our datasets and **root-cause issues**"*
2. *"Devise systems to **evaluate auditor and talent performance**"*
3. *"Report on quality through **metrics and KPIs**"*

この教材のデータセットは、まさにこの3つを練習するために設計されている:
- アノテーターには**隠れたスキル/速度**があり、「速くて雑な人(rusher)」が品質を落とす
  → これを**SQLと統計で炙り出す**のが root-cause 分析の練習
- レビュー(audit)に品質スコア・判定・エラー種別がある → **パフォーマンス評価**の練習
- バッチ・難易度・言語の軸がある → **KPIレポート**の練習

---

## セットアップ(最初に1回)

```bash
cd feather/learn
python3 generate_data.py      # quality.db と csv/ を生成(決定論的: 誰がやっても同じ結果)
```

必要なもの: Python 3.8+ / pandas / matplotlib(分析の日に使用)。
SQLite の CLI は**不要** —— 付属の `sql.py` で SQL を実行する。

```bash
python3 sql.py "SELECT * FROM annotators LIMIT 5;"   # 直接クエリ
python3 sql.py solutions/day1.sql                     # .sql ファイルを実行
python3 sql.py                                        # 対話モード
```

---

## カリキュラム

| Day | テーマ | 身につくこと | ファイル |
|----|--------|------------|---------|
| 1 | SQL基礎 — データに触れる | SELECT / WHERE / ORDER BY | [day1.md](day1.md) |
| 2 | SQL集計 — 数字を作る | GROUP BY / 集計関数 / CASE | [day2.md](day2.md) |
| 3 | SQL中級 — 関係と順位 | JOIN / CTE / ウィンドウ関数 | [day3.md](day3.md) |
| 4 | 統計 — 判断する | 分布 / ばらつき / 相関 / 異常検知 | [day4.md](day4.md) |
| 5 | pandas — 自動化と可視化 | DataFrame / groupby / グラフ | [day5.md](day5.md) |
| 6 | 伝える — 成果に翻訳 | KPI / 結論ファースト / レポート | [day6.md](day6.md) |
| 7 | 統合 — 作品にする | パイプライン化 / 設計の概観 | [day7.md](day7.md) |

各日の演習の模範解答は [`solutions/`](solutions/) にある。**先に自分で解いてから**見ること。

---

## データ辞書(5テーブル)

```
annotators   アノテーター        annotator_id, name, country, tier(junior/senior), hired_date
tasks        作業対象クリップ      task_id, batch, media_type(audio/video), language, duration_sec, difficulty
annotations  1人が1タスクを作業    annotation_id, task_id, annotator_id, submitted_at, time_spent_sec, num_segments
segments     区間ごとのラベル      segment_id, annotation_id, start_sec, end_sec, speaker, emotion, vocal_delivery, transcript_len
audits       レビュー結果          audit_id, annotation_id, reviewer_id, quality_score(0-100), verdict, error_type, audited_at
```

リレーション:
```
annotators 1 ──< annotations >── 1 tasks
                     │
                     ├──< segments
                     └──1 audits   (verdict: approved / minor_fix / rejected)
```

> ⚠️ データは**意図的にパターンを仕込んである**(rusher、難易度ペナルティ、弱点別エラー)。
> 「なぜ品質が落ちるか」が分析で説明できるように作られている。それを見つけるのがゴール。

---

## 進め方のルール(これが一番大事)

1. **毎日、必ず手を動かす。** 読むだけの日はゼロ。
2. **答えを見る前に必ず自分で書く。** 間違えた量が伸びた量。
3. **各クエリで「これは現場の何の問いか」を一言で言えるようにする。**
   (例: このGROUP BYは「どのアノテーターを再研修すべきか」を答えている)
4. Day6 の**レポート1枚**まで必ず到達する。それが7日間の証明。

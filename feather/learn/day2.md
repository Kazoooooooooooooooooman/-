# Day 2 — SQL集計:数字を作る

> 🎯 今日のゴール:`GROUP BY` と集計関数で「**バラバラの行を意味のある数字に束ねる**」。
> ここが分析の心臓部。
>
> 🏢 Mercorでの意味:「アノテーターXの平均品質は?」「バッチBの棄却率は?」——
> KPIはすべて集計から生まれる。**GROUP BY が書ければ、KPIダッシュボードの中身が書ける。**

所要:5時間。

---

## 1. 集計関数 — 列を1つの数字にする

```sql
SELECT COUNT(*)            FROM annotations;   -- 行数(作業の総数)
SELECT AVG(quality_score)  FROM audits;        -- 平均品質
SELECT MIN(quality_score), MAX(quality_score) FROM audits;
SELECT SUM(time_spent_sec) FROM annotations;   -- 総作業時間
```

読みやすく丸めて別名を:
```sql
SELECT ROUND(AVG(quality_score), 1) AS avg_quality FROM audits;
```

> 💡 `COUNT(*)` は行数、`COUNT(列)` は**その列がNULLでない行数**。
> 例: `COUNT(error_type)` = エラーが付いた件数(承認はNULLなので数えない)。これは超頻出テク。

---

## 2. GROUP BY — グループごとに集計する

「全体の平均」ではなく「**○○ごとの**平均」を出すのが GROUP BY。

```sql
-- 難易度ごとの平均品質と件数
SELECT difficulty,
       COUNT(*)                   AS n,
       ROUND(AVG(duration_sec),1) AS avg_dur
FROM tasks
GROUP BY difficulty;
```

鉄則:**`SELECT` に書く非集計列は、すべて `GROUP BY` にも書く。**

```sql
-- アノテーター別の作業件数(annotator_id ごとに束ねる)
SELECT annotator_id, COUNT(*) AS num_annotations
FROM annotations
GROUP BY annotator_id
ORDER BY num_annotations DESC;
```

---

## 3. CASE WHEN — 条件で値を作る(集計の最強の相棒)

`CASE` は「もし〜なら〜」。集計と組み合わせると**割合**が出せる。

```sql
-- 棄却率(%)を1クエリで:rejected を 1、それ以外を 0 にして平均する
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN verdict = 'rejected' THEN 1 ELSE 0 END) AS rejected,
  ROUND(100.0 * SUM(CASE WHEN verdict = 'rejected' THEN 1 ELSE 0 END) / COUNT(*), 1)
       AS rejection_pct
FROM audits;
```

> 💡 SQLite では `verdict = 'rejected'` 自体が 1/0 を返すので
> `SUM(verdict='rejected')` と短く書ける。が、`CASE` は**どのDBでも動く**ので型として覚える。
> ⚠️ `100.0 *`(小数)を忘れると整数割り算で 0 になる。**割合計算の鉄板の罠。**

---

## 4. HAVING — 集計結果を絞る

`WHERE` は集計**前**の行を絞る。`HAVING` は集計**後**のグループを絞る。

```sql
-- 5件以上作業したアノテーターだけ
SELECT annotator_id, COUNT(*) AS n
FROM annotations
GROUP BY annotator_id
HAVING COUNT(*) >= 5;
```

> 🏢 これ重要:品質を語るとき「**サンプル数が少ない人を除外**」しないと誤判断する。
> 2件しかやってない人の平均品質が低くても、それは偶然かもしれない。`HAVING COUNT(*) >= N` は
> 統計的に意味のある母数だけ見るための必須テク(Day4の伏線)。

---

## 5. 実務テンプレ:GROUP BY の黄金パターン

```sql
SELECT
  グループ列,
  COUNT(*)                    AS n,            -- 母数(必ず出す)
  ROUND(AVG(指標), 1)          AS avg_metric,   -- 平均
  ROUND(100.0*SUM(条件)/COUNT(*), 1) AS rate    -- 割合
FROM テーブル
GROUP BY グループ列
HAVING COUNT(*) >= 閾値                          -- 母数フィルタ
ORDER BY avg_metric;                            -- ワーストから
```

このテンプレ1つで、現場のKPIの8割が書ける。**丸暗記推奨。**

---

## 演習(`solutions/day2.sql` で答え合わせ)

> ヒント:`audits` の品質情報と `annotations` のアノテーター情報は別テーブル。
> 今日は**まだ JOIN を習っていない**ので、各テーブル単体で出せる問いだけを扱う。
> (JOINが要る「アノテーター別の品質」は Day3 で完成させる。今日は伏線まで)

1. audit 全体の平均品質スコアを、小数1桁で表示せよ。
2. `verdict`(承認/軽微/棄却)ごとの件数を、多い順に表示せよ。
3. 全体の棄却率(%)を1クエリで出せ。 → 🏢 これがチームの最重要KPIの一つ。
4. 難易度(`difficulty`)ごとに、タスク数と平均尺を出せ。
5. `error_type` ごとの発生件数を多い順に。NULL(承認)は自然に除外される。
   → 🏢 「どのエラーが一番多いか=どこを研修・ガイドライン改善すべきか」。
6. アノテーター別(`annotator_id`)の作業件数を、多い順に表示せよ。
7. アノテーター別の**平均作業時間**(`time_spent_sec`)を出し、長い順に。
8. `language` ごとの平均品質スコア…と言いたいが品質は別テーブル。
   代わりに `language` ごとのタスク数を出せ(Day3で品質と繋ぐ)。
9. **5件以上**作業したアノテーターに絞って、作業件数を表示(`HAVING`)。
10. バッチ(`batch`)ごとのタスク数と、`hard` の割合(%)を出せ。
    → 🏢 「どのバッチが難しい構成か=品質が落ちやすいか」の事前把握。

### 発展
- 11. `verdict` ごとの平均品質スコア(承認/軽微/棄却で当然差が出るはず。閾値の確認)。
- 12. 難易度ごとの平均品質スコア。 → 🏢「難しいタスクほど品質が落ちる」を数値で示す。

---

## 今日の振り返り

- 演習3(棄却率)と5(エラー内訳)は、**そのまま週次レポートに載る数字**。説明できる?
- `HAVING` で母数を絞る理由を、自分の言葉で言える?(Day4で効いてくる)

➡️ **[Day 3](day3.md)** へ。明日は JOIN で「アノテーター × 品質」を繋ぎ、ウィンドウ関数で**ランキング**を作る。ここで一気に"できる人"になる。

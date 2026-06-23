# Day 1 — SQL基礎:データに触れる

> 🎯 今日のゴール:`SELECT / WHERE / ORDER BY / LIMIT` を自分の手で叩き、
> データベースから「欲しい行」を取り出せるようになる。
>
> 🏢 Mercorでの意味:品質の問題を root-cause する第一歩は、必ず「生データを自分で開く」こと。
> 報告された数字を鵜呑みにせず、**自分でクエリして確かめられる人**が信頼される。

所要:4〜5時間。まず `python3 generate_data.py` を実行してから始める。

---

## 0. SQL とは何か(3分)

SQL は「**表(テーブル)に対する質問の言語**」。
データは Excel のような表で保管されていて、SQL はそこから
「この条件の行を、この順で、これだけ取って」と指示する。

基本の形はいつも同じ:

```sql
SELECT   列          -- 何を見たい?
FROM     テーブル     -- どの表から?
WHERE    条件        -- どの行に絞る?
ORDER BY 列          -- どう並べる?
LIMIT    件数;       -- 何件まで?
```

実行は付属ヘルパーで:
```bash
python3 sql.py "SELECT * FROM annotators LIMIT 5;"
```

---

## 1. SELECT — 列を選ぶ

```sql
SELECT * FROM annotators;            -- 全列(* = すべて)
SELECT name, country FROM annotators;-- 必要な列だけ
```

> 💡 実務では `SELECT *` は確認用。本番の分析では**必要な列だけ**選ぶ癖をつける(速い・読みやすい)。

別名(エイリアス)で列名を読みやすくできる:
```sql
SELECT name AS annotator, country AS loc FROM annotators;
```

---

## 2. WHERE — 行を絞る

```sql
SELECT * FROM tasks WHERE difficulty = 'hard';
SELECT * FROM tasks WHERE duration_sec > 60;
SELECT * FROM audits WHERE verdict = 'rejected';
```

条件はつなげられる:
```sql
SELECT * FROM tasks
WHERE media_type = 'video' AND difficulty = 'hard';

SELECT * FROM audits
WHERE verdict = 'rejected' OR quality_score < 60;
```

便利な書き方:
```sql
WHERE quality_score BETWEEN 60 AND 80      -- 範囲
WHERE language IN ('ja','en')              -- いずれか
WHERE error_type IS NULL                   -- NULL(=承認されエラー無し)
WHERE name LIKE 'Aki%'                     -- 前方一致(% は任意文字)
```

> ⚠️ NULL の比較は `= NULL` ではなく **`IS NULL` / `IS NOT NULL`**。ここは初心者が必ず一度ハマる。

---

## 3. ORDER BY — 並べる

```sql
SELECT name, quality_score FROM audits
ORDER BY quality_score ASC;     -- 昇順(小さい順)。ASCは省略可
ORDER BY quality_score DESC;    -- 降順(大きい順)
```

複数キー:
```sql
SELECT * FROM tasks ORDER BY difficulty, duration_sec DESC;
```

---

## 4. LIMIT — 件数を絞る

```sql
SELECT * FROM audits ORDER BY quality_score ASC LIMIT 10;  -- 最低品質トップ10
```

`ORDER BY` + `LIMIT` の組み合わせは「ワースト/ベスト◯件」を出す定番。
**現場で最も多用するパターン**(例: 品質が低い作業トップ10を即出す)。

---

## 5. DISTINCT — 重複を消す

```sql
SELECT DISTINCT difficulty FROM tasks;   -- 難易度は何種類ある?
SELECT DISTINCT error_type FROM audits;  -- エラー種別の一覧
```

---

## 演習(自分で書く → `solutions/day1.sql` で答え合わせ)

各問、**「これは現場の何の問いか」も一言で**言えるようにすること。

1. `annotators` テーブルの全列を表示せよ。
2. `senior` ティアのアノテーターの名前と国だけを表示せよ。
3. `hard` 難易度のタスクを、尺(`duration_sec`)が長い順に表示せよ。
4. `rejected` 判定の audit を、品質スコアが低い順に**10件**表示せよ。
   → 🏢 これは「最優先で再レビューすべき作業はどれか」を答えている。
5. 品質スコアが 50 未満の audit を表示せよ。何件ある?
6. `audits` の `error_type` にどんな種類があるか、重複なしで一覧せよ。
7. `video` かつ `hard` のタスクを表示せよ。
8. 名前が `Aki` で始まるアノテーターを表示せよ。
9. `annotations` のうち、作業時間(`time_spent_sec`)が長い順トップ5を表示せよ。
   → 🏢 「時間をかけすぎている(=非効率 or 高難度)作業」の発見。
10. `error_type` が NULL でない(=何か指摘された)audit を、品質スコア順に5件。

### 発展(できたら)
- 11. `easy` でないタスク(`difficulty != 'easy'`)を尺の短い順に5件。
- 12. 品質スコアが 80〜90 の audit を、スコア降順で表示。

---

## 今日の振り返り(ノートに書く)

- `WHERE` で「絞る」と `ORDER BY`+`LIMIT` で「ワースト/ベスト」を出せた?
- 演習4と9を、**Mercorの面接官に口頭で説明**できる?(「このクエリで何が分かるか」)

➡️ できたら **[Day 2](day2.md)** へ。明日は「集計して数字を作る」——ここから分析が始まる。

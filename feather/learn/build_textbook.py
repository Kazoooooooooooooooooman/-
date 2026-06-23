#!/usr/bin/env python3
"""
build_textbook.py — インタラクティブ教科書 textbook.html を生成する。

quality.db を base64 で埋め込み、ブラウザ内 SQLite (sql.js / WASM) で
本物のSQLをその場で実行できる単一ファイルを作る。

実行: python3 build_textbook.py   →  textbook.html
"""
import base64, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
DB_B64 = base64.b64encode(open(os.path.join(HERE, "quality.db"), "rb").read()).decode()

# ----------------------------------------------------------------- 教材コンテンツ
# 各 day: title, intro(HTML), sections[], exercises[]
# exercise: prompt, starter, solution, ordered(bool), hints[], explain
CONTENT = {
  "intro": """
    <h2>ようこそ feather Academy へ 🪶</h2>
    <p>これは「読むだけ」で終わらない教科書。<b>その場でSQLを書いて、本物のデータベースで実行</b>できる。
    間違えてもOK——ヒントと解説が出るし、詰まったら「Claudeに聞く」で質問を作れる。</p>

    <h3>🎯 この教科書の「完成形」</h3>
    <p>7日間のゴールは、バラバラのデータから<b>自分の手で、こういう品質レポートを生み出せるようになる</b>こと👇</p>
    <div class="goalbox">
      <div class="goalbox-h">📊 週次 品質レポート(あなたが作れるようになるもの)</div>
      <ul>
        <li><b>棄却率は 32%</b>(目標20%)。棄却の <b>56% が下位3名に集中</b>。</li>
        <li>下位3名(Mika_05, Yuki_08, Nina_09)への<b>再研修で大幅改善が見込める</b>。</li>
        <li>hardタスクの品質は medium 比 <b>-7pt</b>。難易度配分の見直しを提案。</li>
      </ul>
      <div class="goalbox-f">↑ これは「事実の羅列」ではなく<b>意思決定者が今すぐ動ける成果物</b>。
      数字 → 原因 → 打ち手 がワンセットになっている。これが書けると評価が変わる。</div>
    </div>

    <h3>🎁 あなたが得られるもの</h3>
    <table class="dict">
      <tr><th>スキル</th><th>できるようになること</th><th>Mercorでの意味</th></tr>
      <tr><td><b>SQL</b></td><td>データを自分で開き、集計し、原因を特定</td><td>"root-cause issues"</td></tr>
      <tr><td><b>統計</b></td><td>「低い」を"統計的に低い"と判断できる</td><td>"quantitative analytical ability"</td></tr>
      <tr><td><b>pandas</b></td><td>分析を自動化し、グラフにする</td><td>"leveraging databases & scripting"</td></tr>
      <tr><td><b>レポート</b></td><td>数字を"成果の言葉"に翻訳して伝える</td><td>"leadership-facing reports"</td></tr>
      <tr><td>🏆 <b>作品</b></td><td>面接で見せられるポートフォリオ1個</td><td>"building systems from scratch"</td></tr>
    </table>
    <div class="callout">この4スキル+作品が、Mercor の Quality PM が「1日に回す仕事」そのもの:
      <b>データを開き(SQL)→原因を詰め(統計)→自動化し(pandas)→1枚で伝える(レポート)</b>。</div>

    <h3>🗺 7日間の地図</h3>
    <table class="dict">
      <tr><th>Day</th><th>テーマ</th><th>身につくこと</th></tr>
      <tr><td>1</td><td>データに触れる</td><td>SELECT / WHERE / ORDER BY</td></tr>
      <tr><td>2</td><td>数字を作る</td><td>GROUP BY / 集計 / CASE(棄却率KPI)</td></tr>
      <tr><td>3</td><td>関係と順位</td><td>JOIN / 集計(アノテーター別品質)</td></tr>
      <tr><td>4</td><td>判断する</td><td>分布 / ばらつき / 統計</td></tr>
      <tr><td>5-7</td><td>自動化・伝達・統合</td><td>pandas / レポート / 完成形へ</td></tr>
    </table>

    <h3>🗃 使うデータ(5つのテーブル)</h3>
    <table class="dict">
      <tr><th>テーブル</th><th>意味</th><th>主な列</th></tr>
      <tr><td>annotators</td><td>作業者</td><td>annotator_id, name, country, tier, hired_date</td></tr>
      <tr><td>tasks</td><td>作業対象クリップ</td><td>task_id, batch, media_type, language, duration_sec, difficulty</td></tr>
      <tr><td>annotations</td><td>1人が1タスクを作業</td><td>annotation_id, task_id, annotator_id, time_spent_sec, num_segments</td></tr>
      <tr><td>segments</td><td>区間ごとのラベル</td><td>start_sec, end_sec, speaker, emotion, vocal_delivery</td></tr>
      <tr><td>audits</td><td>レビュー結果</td><td>quality_score, verdict, error_type</td></tr>
    </table>

    <div class="callout" style="background:#ecfdf5;border-color:#10b981">
      <b>▶ さあ始めよう。</b> 左メニューの「Day 1 — データに触れる」をクリック。
      最初の1問は3秒で解ける。各Dayの演習を全部 ✓ にして、上の「完成形」までたどり着こう。
    </div>
  """,
  "days": [
    {
      "title": "Day 1 — 担当プロジェクトを把握する",
      "subtitle": "初日:チームとデータを自分の目で見る",
      "sections": [
        {"h":"📖 今日のストーリー", "html":"""
          <div class="story">あなたは今日から <b>Mercor の品質プログラムマネージャー</b>。
          担当は、ある AI ラボ向けの<b>音声アノテーション・プロジェクト</b>。
          作業者(アノテーター)が音声を区切り、感情や発話をラベル付けし、レビュアーが品質をチェックして
          クライアントに納品する——その品質を守るのがあなたの仕事。<br><br>
          初日の今日は、<b>まず手元のデータに自分で触れる</b>。報告された数字を鵜呑みにせず、
          自分でデータベースを開ける人が信頼される。今日の道具は「欲しい行を取り出す」4つだけ。</div>
          <p>SQLの形はいつも同じ。必要な所だけ使う:</p>
          <pre class="sql">SELECT 列       -- 何を見たい?
FROM   テーブル  -- どの表から?
WHERE  条件     -- どの行に絞る?(任意)
ORDER BY 列     -- どう並べる?(任意)
LIMIT  件数;    -- 何件まで?(任意)</pre>
        """},
      ],
      "exercises": [
        {
          "scene":"着任初日。まず<b>自分のチームに誰がいるか</b>を把握したい。マネージャーとして最初にやるのは『名簿の確認』。誰が junior で誰が senior か分かれば、難しい案件を誰に振れるか判断できる。",
          "prompt":"作業者一覧から <b>名前(name)とランク(tier)</b> を5人分だけ表示する。",
          "data":"<code>annotators</code>(作業者)テーブル。列: name, tier, country, hired_date …",
          "starter":"SELECT ____, ____ FROM annotators LIMIT 5;",
          "solution":"SELECT name, tier FROM annotators LIMIT 5;",
          "ordered":False,
          "hints":["見たい列はカンマ区切りで並べる: SELECT a, b","SELECT name, tier FROM annotators LIMIT 5;"],
          "explain":"SELECT のあとに見たい列名をカンマで並べる。* は全列だが、実務では必要な列だけ選ぶのが基本(速い・読みやすい)。LIMIT 5 はとりあえず5件だけ覗く時に使う。",
          "soWhat":"チームの顔ぶれが分かった。次は『senior は誰か』を絞り込みたくなる → それが演習2。"
        },
        {
          "scene":"来週、<b>特に難しい音声バッチ</b>が入ってくる。品質を落とさないため、<b>熟練(senior)の作業者にだけ振りたい</b>。「senior は誰?」をパッと出せる必要がある。",
          "prompt":"ランク(tier)が <b>senior の人だけ</b>に絞って、名前とランクを表示する。",
          "data":"<code>annotators</code>。tier の中身は <code>'junior'</code> か <code>'senior'</code>(小文字)。",
          "starter":"SELECT name, tier FROM annotators WHERE ____ = '____';",
          "solution":"SELECT name, tier FROM annotators WHERE tier='senior';",
          "ordered":False,
          "hints":["WHERE 列 = 値 の形。文字列はシングルクォートで囲む","データの中身は小文字。'Senior' ではなく 'senior'","SELECT name, tier FROM annotators WHERE tier='senior';"],
          "explain":"WHERE で行を絞る。= の前に比べる列名、後ろに値。文字列は '...' で囲む。クォートの中身は大文字小文字を区別するので 'senior'(小文字)。",
          "soWhat":"難案件を任せる候補リストができた。WHERE は『誰に・どれを』を選ぶ全ての出発点。"
        },
        {
          "scene":"レビューチームから「<b>今週のレビュー、何時間かかる?</b>」と聞かれた。長いクリップほどレビューに時間がかかる。<b>難しくて長い順</b>に並べれば、工数の重い案件から見積もれる。",
          "prompt":"難易度(difficulty)が <b>hard</b> のタスクを、<b>長さ(duration_sec)が長い順</b>に表示(列: task_id, difficulty, duration_sec)。",
          "data":"<code>tasks</code>(作業対象クリップ)。difficulty は easy/medium/hard、duration_sec は秒数。",
          "starter":"SELECT task_id, difficulty, duration_sec\nFROM tasks\nWHERE ____ = '____'\nORDER BY ____ ____;",
          "solution":"SELECT task_id, difficulty, duration_sec FROM tasks WHERE difficulty='hard' ORDER BY duration_sec DESC;",
          "ordered":True,
          "hints":["長い順=大きい順なので DESC","ORDER BY duration_sec DESC","SELECT task_id, difficulty, duration_sec FROM tasks WHERE difficulty='hard' ORDER BY duration_sec DESC;"],
          "explain":"WHERE で hard に絞り、ORDER BY duration_sec DESC で長い順に。DESC=降順(大→小)、ASC=昇順(省略時のデフォルト)。",
          "soWhat":"重い案件が上から並んだ → 工数見積もりや人の割り当てに使える。ORDER BY は『優先順位づけ』の道具。"
        },
        {
          "scene":"🚨 <b>クライアントからクレーム</b>。「先週の納品、品質が低いものが混じってる」。あなたは今すぐ<b>一番ひどい棄却作業から</b>確認して、再対応の優先順位を決めないといけない。会議は30分後。",
          "prompt":"棄却(verdict が rejected)された作業を、<b>品質スコアが低い順に10件</b>(列: annotation_id, quality_score, verdict)。",
          "data":"<code>audits</code>(レビュー結果)。verdict は approved/minor_fix/rejected、quality_score は0〜100。",
          "starter":"SELECT annotation_id, quality_score, verdict\nFROM audits\nWHERE ____\nORDER BY ____ ____\nLIMIT ____;",
          "solution":"SELECT annotation_id, quality_score, verdict FROM audits WHERE verdict='rejected' ORDER BY quality_score ASC LIMIT 10;",
          "ordered":True,
          "hints":["棄却だけ → WHERE verdict='rejected'","低い順=小さい順=ASC(省略も可)、件数は LIMIT 10","SELECT annotation_id, quality_score, verdict FROM audits WHERE verdict='rejected' ORDER BY quality_score ASC LIMIT 10;"],
          "explain":"WHERE で棄却に絞り、ORDER BY quality_score ASC で低い順、LIMIT 10 でワースト10。『WHERE で絞る → ORDER BY で並べる → LIMIT でN件』は最頻出の組み合わせ。",
          "soWhat":"最悪の10件が即出せた=会議で『これから対応します』と具体的に言える。これがクレーム対応の第一歩。"
        },
      ],
    },
    {
      "title":"Day 2 — 週次レポートの数字を作る",
      "subtitle":"月曜の朝:KPIを1本のクエリで",
      "sections":[
        {"h":"📖 今日のストーリー", "html":"""
          <div class="story">月曜の朝。あなたは<b>上司とクライアントに出す週次品質レポート</b>を作る。
          1行ずつのデータを見ても意味がない。欲しいのは<b>「で、全体としてどうなの?」という1つの数字</b>——
          平均品質は? 棄却は何件? 棄却率は何%? これを<b>集計(あつめて数える)</b>で作る。</div>
          <p>集計関数=たくさんの行を1つの数字に束ねる道具:</p>
          <pre class="sql">COUNT(*)  -- 件数      AVG(列) -- 平均
SUM(列)   -- 合計      MIN/MAX -- 最小/最大</pre>
          <p>「全体」ではなく「○○ごと」に集計したい時は <b>GROUP BY ○○</b> を足す。</p>
        """},
      ],
      "exercises":[
        {
          "scene":"レポートの一番上に載せる<b>『今週の平均品質スコア』</b>。チームの健康診断のような数字。これが先週より下がっていたら赤信号。",
          "prompt":"レビュー結果全体の <b>平均品質スコア</b>を小数1桁で(列名 avg_q)。",
          "data":"<code>audits</code>。quality_score(0〜100)を平均する。",
          "starter":"SELECT ROUND(____(quality_score), 1) AS avg_q FROM audits;",
          "solution":"SELECT ROUND(AVG(quality_score),1) AS avg_q FROM audits;",
          "ordered":False,
          "hints":["平均は AVG","SELECT ROUND(AVG(quality_score),1) AS avg_q FROM audits;"],
          "explain":"AVG で平均、ROUND(x,1) で小数1桁に。AS で結果に分かりやすい列名を付ける。レポートの数字は必ず丸めて読みやすく。",
          "soWhat":"全体の地力が1つの数字に。先週比・目標(例80点)と並べれば『良い/悪い』が言える。"
        },
        {
          "scene":"クライアントに<b>『納品の内訳』</b>を見せたい。承認・軽微修正・棄却がそれぞれ何件か。比率が分かると『手戻りがどれくらい発生しているか』が伝わる。",
          "prompt":"判定(verdict)<b>ごとの件数</b>を、多い順に(列: verdict, n)。",
          "data":"<code>audits</code>。verdict は approved / minor_fix / rejected の3種類。",
          "starter":"SELECT verdict, COUNT(*) AS n\nFROM audits\nGROUP BY ____\nORDER BY n ____;",
          "solution":"SELECT verdict, COUNT(*) AS n FROM audits GROUP BY verdict ORDER BY n DESC;",
          "ordered":True,
          "hints":["verdict ごと → GROUP BY verdict","多い順=DESC","SELECT verdict, COUNT(*) AS n FROM audits GROUP BY verdict ORDER BY n DESC;"],
          "explain":"GROUP BY verdict で3グループに分け、COUNT(*) で各グループの件数。『○○ごとの件数』は最も基本のレポート部品。",
          "soWhat":"内訳が出た。次は『で、棄却は全体の何%?』と割合にしたくなる → 演習3。"
        },
        {
          "scene":"上司「<b>結局、今週の棄却率は何%?</b>」。これがチームの<b>最重要KPIの一つ</b>。目標20%に対して今どこか、を毎週報告する。1本のクエリで即答できるようにしておく。",
          "prompt":"<b>全体の棄却率(%)</b>を小数1桁で(列名 reject_pct)。",
          "data":"<code>audits</code>。棄却数 ÷ 全体 × 100。",
          "starter":"SELECT ROUND(100.0 * SUM(____='rejected') / COUNT(*), 1) AS reject_pct\nFROM audits;",
          "solution":"SELECT ROUND(100.0*SUM(verdict='rejected')/COUNT(*),1) AS reject_pct FROM audits;",
          "ordered":False,
          "hints":["条件は verdict='rejected'","100.0(小数)を掛けるのを忘れずに(整数だと0になる)","SELECT ROUND(100.0*SUM(verdict='rejected')/COUNT(*),1) AS reject_pct FROM audits;"],
          "explain":"SUM(verdict='rejected') は『棄却なら1, それ以外0』の合計=棄却数。それを全体で割り100倍。100.0 と小数にしないと整数割り算で 0 になる定番の罠。",
          "soWhat":"これがレポートの主役の数字。『棄却率32%(目標20%・未達)』のように、目標と並べて初めて意味が出る。"
        },
      ],
    },
    {
      "title":"Day 3 — 「なぜ棄却が多い?」犯人を探す",
      "subtitle":"root-cause:作業に名前を紐づけ、ランキングする",
      "sections":[
        {"h":"📖 今日のストーリー", "html":"""
          <div class="story">棄却率が高いと分かった。上司の次の質問は必ず<b>「なぜ?誰の作業?」</b>。
          ところが品質は <code>audits</code>、名前は <code>annotators</code> と<b>別々の表</b>にある。
          これを繋がないと「誰の品質が低いか」が分からない。表を繋ぐ道具が <b>JOIN</b>。
          繋いでから集計すれば、<b>アノテーター別の品質ランキング</b>——
          つまり『誰を再研修すべきか』が一発で出る。これが Quality PM の中核作業。</div>
          <pre class="sql">SELECT a.name, ad.quality_score
FROM annotations an
JOIN annotators a  ON a.annotator_id  = an.annotator_id   -- 作業 ⇔ 人
JOIN audits      ad ON ad.annotation_id = an.annotation_id; -- 作業 ⇔ レビュー</pre>
          <p>an / a / ad はテーブルの別名。<code>ON</code> は『どの列が一致したら繋ぐか』。</p>
        """},
      ],
      "exercises":[
        {
          "scene":"棄却された作業を見ても <code>annotator_id</code>(番号)しか書いてなくて<b>誰だか分からない</b>。まずは作業に<b>作業者の名前をくっつけて</b>、人間が読める形にする。これが全ての分析の前提。",
          "prompt":"作業に作業者名を JOIN し、<b>作業ID・名前・作業時間</b>を10件(列: annotation_id, name, time_spent_sec)。",
          "data":"<code>annotations</code>(作業)と <code>annotators</code>(作業者)。共通キーは <code>annotator_id</code>。",
          "starter":"SELECT an.annotation_id, a.name, an.time_spent_sec\nFROM annotations an\nJOIN annotators a ON a.____ = an.____\nLIMIT 10;",
          "solution":"SELECT an.annotation_id, a.name, an.time_spent_sec FROM annotations an JOIN annotators a ON a.annotator_id=an.annotator_id LIMIT 10;",
          "ordered":False,
          "hints":["繋ぐキーは両テーブルの annotator_id","ON a.annotator_id = an.annotator_id","SELECT an.annotation_id, a.name, an.time_spent_sec FROM annotations an JOIN annotators a ON a.annotator_id=an.annotator_id LIMIT 10;"],
          "explain":"ON で『どの列が一致したら横に繋ぐか』を指定。annotations.annotator_id と annotators.annotator_id を突き合わせる。番号→名前になり、人間が読める表に。",
          "soWhat":"これで『誰の作業か』が分かるようになった。あとは人ごとに集計すれば品質ランキングになる → 演習2。"
        },
        {
          "scene":"🏢 <b>今日の本丸</b>。上司「棄却が多い原因、<b>誰の品質が低いのか</b>リストで出して」。これに答えるのがこのクエリ。作業者ごとに品質を平均し、低い順に並べる。ただし<b>2件しかやってない人を『品質低い』と決めつけるのは不公平</b>——だから5件以上に絞る。",
          "prompt":"作業者別に <b>件数 n と平均品質 avg_q</b> を出し、<b>5件以上</b>の人だけ、品質の<b>低い順</b>に(列: name, n, avg_q)。",
          "data":"<code>annotations</code> + <code>annotators</code> + <code>audits</code> を JOIN。",
          "starter":"SELECT a.name, COUNT(*) AS n, ROUND(AVG(ad.quality_score),1) AS avg_q\nFROM annotations an\nJOIN annotators a  ON a.annotator_id  = an.annotator_id\nJOIN audits      ad ON ad.annotation_id = an.annotation_id\nGROUP BY a.annotator_id\nHAVING COUNT(*) >= ____\nORDER BY avg_q ____;",
          "solution":"SELECT a.name, COUNT(*) AS n, ROUND(AVG(ad.quality_score),1) AS avg_q FROM annotations an JOIN annotators a ON a.annotator_id=an.annotator_id JOIN audits ad ON ad.annotation_id=an.annotation_id GROUP BY a.annotator_id HAVING COUNT(*)>=5 ORDER BY avg_q ASC;",
          "ordered":True,
          "hints":["5件以上 = HAVING COUNT(*) >= 5","低い順 = ASC","...HAVING COUNT(*)>=5 ORDER BY avg_q ASC;"],
          "explain":"JOINで繋ぎ、GROUP BYで人ごとに集計、HAVINGで母数の少ない人を除外、ORDER BYで低い順。HAVING は『集計したあとのグループを絞る』(WHEREは集計前の行を絞る)。母数フィルタは公平な評価の生命線。",
          "soWhat":"一番上に出た人が『再研修の最優先候補』。これがそのまま施策(誰を研修するか)に直結する。Day5でこの人達を散布図にして『速くて雑(rusher)』かどうかまで見る。"
        },
      ],
    },
    {
      "title":"Day 4 — 「本当に悪い?偶然?」を見抜く",
      "subtitle":"統計:平均の裏にある『ばらつき』を見る",
      "sections":[
        {"h":"📖 今日のストーリー", "html":"""
          <div class="story">あなたは下位の作業者を再研修にかけようとしている。でも慎重な上司はこう言う:
          <b>「その人、本当に実力が低いの? たまたま難しい回が当たっただけじゃない?」</b><br><br>
          ここで効くのが<b>統計</b>。平均だけ見ると騙される。同じ平均70点でも『全員70前後で安定』と
          『半分95・半分45でバラバラ』では全く別の問題。だから<b>分布(ばらつき)</b>を見る。
          チーム全体が低いのか、一部だけが低いのか——で打ち手が変わる。</div>
          <p>連続した数字を『階級(バンド)』に分けると、SQLでも分布が見える。
          道具は Day2 の <code>CASE</code>(条件で値を作る)。</p>
        """},
      ],
      "exercises":[
        {
          "scene":"再研修の前に、まず<b>『品質が低いのは一部の人だけ?それともチーム全体?』</b>を確かめたい。スコアを点数帯ごとに数えて分布を見る。低い帯に大量にいたら全体研修、少数だけなら個別対応——判断が変わる。",
          "prompt":"品質スコアを<b>点数帯ごと</b>に件数集計(90+/80-89/70-79/60-69/それ未満)(列: band, n)。",
          "data":"<code>audits</code> の quality_score。CASE で帯に分ける。",
          "starter":"SELECT CASE\n  WHEN quality_score >= 90 THEN '90-100'\n  WHEN quality_score >= 80 THEN '80-89'\n  WHEN quality_score >= 70 THEN '70-79'\n  WHEN quality_score >= 60 THEN '60-69'\n  ELSE '< 60'\nEND AS band, COUNT(*) AS n\nFROM audits\nGROUP BY ____\nORDER BY band DESC;",
          "solution":"SELECT CASE WHEN quality_score>=90 THEN '90-100' WHEN quality_score>=80 THEN '80-89' WHEN quality_score>=70 THEN '70-79' WHEN quality_score>=60 THEN '60-69' ELSE '< 60' END AS band, COUNT(*) AS n FROM audits GROUP BY band ORDER BY band DESC;",
          "ordered":True,
          "hints":["CASE で作った別名 band でグループ化できる","GROUP BY band","...GROUP BY band ORDER BY band DESC;"],
          "explain":"CASE WHEN で連続値を階級に変換し、その階級で GROUP BY。これがSQLで作る簡易ヒストグラム。山が低い方に寄れば全体の問題、特定の人だけ低いなら個人の問題。",
          "soWhat":"分布が見えた。次の一歩(Day5・pandas)では、これを実際のグラフにし、作業者ごとの『平均±ばらつき』や外れ値検知(zスコア)で『偶然 vs 実力』を見分ける。"
        },
      ],
    },
    {
      "title":"Day 5-7 — 自動化し、伝え、作品にする",
      "subtitle":"ここからはターミナルで(pandas / レポート)",
      "sections":[
        {"h":"📖 ここまでのあなた、ここから先", "html":"""
          <div class="story">Day1〜4で、あなたは<b>データを開き(SQL)→KPIを作り→犯人を特定し→統計で裏を取る</b>
          までできるようになった。これは Quality PM の頭脳そのもの。<br><br>
          Day5〜7は、それを<b>『毎週ボタン一つで回る仕組み』</b>にして、<b>意思決定者に伝わる1枚</b>に変え、
          <b>面接で見せられる作品</b>にする段階。ここは Python(pandas)を使うのでブラウザ内では動かせない。
          リポジトリの <code>feather/learn/</code> で手を動かそう。</div>
          <ul>
            <li><b>Day 5(pandas・自動化)</b>: <code>python3 solutions/day5.py</code> — 集計＋グラフ(散布図でrusherが見える)</li>
            <li><b>Day 6(伝える)</b>: <code>solutions/day6_report_template.md</code> を埋める(結論→根拠→打ち手)</li>
            <li><b>Day 7(統合)</b>: <code>python3 solutions/run_all.py</code> — データ→分析→レポートを一括再生成</li>
          </ul>
          <div class="callout">最終的に『棄却率32%、棄却の56%が下位3名に集中、再研修で改善可能』のような
          <b>成果レポート</b>が自動で出る。これがそのままポートフォリオ=最初のページで見た「完成形」。</div>
          <p>SQL(Day1-4)が固まったら、ターミナルに移ってここを完成させよう。お疲れさま 🪶</p>
        """},
      ],
      "exercises":[],
    },
  ],
}

# ----------------------------------------------------------------- HTML テンプレ
TEMPLATE = r"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>feather Academy — インタラクティブSQL教科書</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js"></script>
<style>
:root{--bg:#f7f8fa;--panel:#fff;--ink:#1f2937;--muted:#6b7280;--line:#e5e7eb;
  --brand:#4f46e5;--brandw:#eef2ff;--green:#10b981;--greenw:#ecfdf5;--rose:#e11d48;--rosew:#fef2f2;--amber:#f59e0b;}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{font-family:ui-sans-serif,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;
  background:var(--bg);color:var(--ink);font-size:15px;line-height:1.7}
.layout{display:flex;min-height:100vh}
/* sidebar */
.side{flex:0 0 230px;background:var(--panel);border-right:1px solid var(--line);padding:18px 14px;position:sticky;top:0;height:100vh;overflow:auto}
.brand{font-size:18px;font-weight:800;margin-bottom:4px}.brand .f{color:var(--brand)}
.brand-sub{font-size:11px;color:var(--muted);margin-bottom:18px}
.nav a{display:block;padding:9px 11px;border-radius:9px;color:var(--ink);text-decoration:none;font-size:14px;margin-bottom:3px;cursor:pointer}
.nav a:hover{background:var(--bg)}
.nav a.active{background:var(--brandw);color:var(--brand);font-weight:700}
.nav a .done{color:var(--green);float:right}
.nav .sub{font-size:11px;color:var(--muted);padding:0 11px 6px}
.prog{margin-top:16px;font-size:12px;color:var(--muted)}
.prog-bar{height:6px;background:var(--line);border-radius:99px;margin-top:6px;overflow:hidden}
.prog-bar i{display:block;height:100%;background:var(--green);width:0%}
/* main */
.main{flex:1;max-width:900px;margin:0 auto;padding:34px 30px 90px}
h2{font-size:24px;margin:0 0 4px}h3{font-size:18px;margin:26px 0 8px}
.daysub{color:var(--brand);font-weight:700;font-size:13px;letter-spacing:.04em;margin-bottom:18px}
p{margin:8px 0}
.callout{background:var(--brandw);border-left:4px solid var(--brand);padding:12px 16px;border-radius:8px;margin:14px 0;font-size:14px}
.story{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin:10px 0 16px;font-size:14.5px;line-height:1.75}
.goalbox{background:#fff;border:2px solid var(--brand);border-radius:14px;padding:18px 20px;margin:14px 0;box-shadow:0 2px 10px rgba(79,70,229,.08)}
.goalbox-h{font-weight:800;color:var(--brand);margin-bottom:10px;font-size:15px}
.goalbox ul{margin:6px 0;padding-left:22px}.goalbox li{margin:5px 0}
.goalbox-f{margin-top:12px;padding-top:12px;border-top:1px dashed var(--line);font-size:13px;color:var(--muted)}
pre.sql,code{font-family:ui-monospace,"SF Mono",Menlo,monospace}
pre.sql{background:#0f172a;color:#e2e8f0;padding:14px 16px;border-radius:10px;overflow:auto;font-size:13px;line-height:1.55}
code{background:#eef0f3;padding:1px 6px;border-radius:5px;font-size:13px}
table.dict,table.res{border-collapse:collapse;width:100%;margin:12px 0;font-size:13px;background:var(--panel)}
table.dict th,table.dict td,table.res th,table.res td{border:1px solid var(--line);padding:7px 10px;text-align:left}
table.dict th,table.res th{background:#f1f3f7;font-weight:700}
table.res td{font-variant-numeric:tabular-nums;font-family:ui-monospace,monospace;font-size:12.5px}
table.res tr:nth-child(even) td{background:#fafbfc}
/* exercise card */
.ex{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;margin:20px 0;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.ex.solved{border-color:var(--green);box-shadow:0 0 0 1px var(--green)}
.ex-h{display:flex;align-items:center;gap:8px;font-weight:800;margin-bottom:8px}
.ex-h .tag{font-size:11px;background:var(--bg);color:var(--muted);border:1px solid var(--line);border-radius:99px;padding:1px 9px}
.ex-h .ok{margin-left:auto;color:var(--green);font-weight:800}
.ex-prompt{margin-bottom:10px}
.scene{background:#fff7ed;border:1px solid #fed7aa;border-radius:9px;padding:10px 14px;margin-bottom:10px;font-size:13.5px;line-height:1.65}
.scene b{color:#c2410c}
.dataline{font-size:13px;color:var(--muted);margin-bottom:10px;background:#f8fafc;border:1px solid var(--line);border-radius:8px;padding:8px 12px}
.dataline b{color:var(--ink)}
.sowhat{margin-top:12px;font-size:13px;color:#3730a3;background:var(--brandw);border-radius:9px;padding:10px 14px;line-height:1.6}
.editor{width:100%;min-height:92px;font-family:ui-monospace,Menlo,monospace;font-size:13.5px;line-height:1.5;
  padding:12px;border:1px solid var(--line);border-radius:10px;background:#fbfcfe;color:var(--ink);resize:vertical;tab-size:2}
.editor:focus{outline:2px solid var(--brand);border-color:var(--brand)}
.btns{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.btn{font:inherit;font-size:13px;border:1px solid var(--line);background:var(--panel);color:var(--ink);
  padding:8px 14px;border-radius:9px;cursor:pointer}
.btn:hover{border-color:var(--brand);color:var(--brand)}
.btn.run{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:700}
.btn.run:hover{filter:brightness(1.07);color:#fff}
.btn.ghost{color:var(--muted)}
.msg{margin-top:12px;padding:10px 14px;border-radius:9px;font-size:13.5px;display:none}
.msg.show{display:block}
.msg.ok{background:var(--greenw);color:#065f46;border:1px solid #a7f3d0}
.msg.err{background:var(--rosew);color:#9f1239;border:1px solid #fecdd3}
.msg.warn{background:#fffbeb;color:#92400e;border:1px solid #fde68a}
.hint{margin-top:10px;font-size:13.5px;background:#fffbeb;border:1px solid #fde68a;border-radius:9px;padding:10px 14px;display:none}
.hint.show{display:block}
.explain{margin-top:10px;font-size:13.5px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:9px;padding:10px 14px;display:none}
.explain.show{display:block}
.result-wrap{margin-top:12px;overflow:auto;max-height:340px;border-radius:8px}
.loading{padding:40px;text-align:center;color:var(--muted)}
.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;
  padding:11px 18px;border-radius:10px;font-size:13px;opacity:0;transition:.25s;pointer-events:none;z-index:50}
.toast.show{opacity:1}
.foot{margin-top:30px;font-size:12px;color:var(--muted);border-top:1px solid var(--line);padding-top:14px}
</style>
</head>
<body>
<div class="layout">
  <aside class="side">
    <div class="brand"><span class="f">🪶 feather</span> Academy</div>
    <div class="brand-sub">インタラクティブSQL教科書</div>
    <div class="nav" id="nav"></div>
    <div class="prog">進捗 <span id="prog-text">0/0</span>
      <div class="prog-bar"><i id="prog-fill"></i></div>
    </div>
  </aside>
  <main class="main" id="main">
    <div class="loading">データベースを読み込み中… (初回はネット経由でSQLエンジンを取得します)</div>
  </main>
</div>
<div class="toast" id="toast"></div>

<script>
const CONTENT = __CONTENT__;
const DB_B64 = "__DB__";
let db = null, current = 0;
const $ = s => document.querySelector(s);
const solved = JSON.parse(localStorage.getItem("feather_solved") || "{}");

function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1600);}

function totalExercises(){return CONTENT.days.reduce((a,d)=>a+d.exercises.length,0);}
function solvedCount(){return Object.keys(solved).filter(k=>solved[k]).length;}

function renderNav(){
  const nav=$("#nav");
  let html=`<a class="${current===-1?'active':''}" onclick="go(-1)">はじめに</a><div class="sub">カリキュラム</div>`;
  CONTENT.days.forEach((d,i)=>{
    const exIds=d.exercises.map((_,j)=>`d${i}e${j}`);
    const allDone=exIds.length>0 && exIds.every(id=>solved[id]);
    html+=`<a class="${current===i?'active':''}" onclick="go(${i})">${d.title}${allDone?'<span class="done">✓</span>':''}</a>`;
  });
  nav.innerHTML=html;
  const tot=totalExercises(),sc=solvedCount();
  $("#prog-text").textContent=`${sc}/${tot}`;
  $("#prog-fill").style.width=(tot?100*sc/tot:0)+"%";
}

function el(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;}

function resultTable(res){
  if(!res||!res.length){return `<div class="msg warn show">結果は0行でした(クエリは正常に動いています)。</div>`;}
  const r=res[0];let h='<div class="result-wrap"><table class="res"><tr>';
  r.columns.forEach(c=>h+=`<th>${c}</th>`);h+='</tr>';
  r.values.forEach(row=>{h+='<tr>';row.forEach(c=>h+=`<td>${c===null?'<i style="color:#9ca3af">NULL</i>':c}</td>`);h+='</tr>';});
  h+=`</table></div><div style="font-size:12px;color:#6b7280;margin-top:4px">${r.values.length} 行</div>`;
  return h;
}

function normalize(res,ordered){
  if(!res||!res.length)return JSON.stringify({c:[],r:[]});
  const x=res[0];let rows=x.values.map(rw=>rw.map(c=>c===null?null:String(c)));
  const cols=x.columns.map(c=>c.toLowerCase());
  if(!ordered)rows=rows.map(r=>JSON.stringify(r)).sort(); else rows=rows.map(r=>JSON.stringify(r));
  return JSON.stringify({c:cols,r:rows});
}

function runExercise(i,j){
  const id=`d${i}e${j}`, ex=CONTENT.days[i].exercises[j];
  const sql=$("#ed-"+id).value.trim();
  const out=$("#out-"+id), msg=$("#msg-"+id);
  msg.className="msg";
  if(sql.includes("____")){msg.className="msg warn show";msg.textContent="まだ ____ が残っています。空欄を埋めてね。";return;}
  let userRes;
  try{userRes=db.exec(sql);}
  catch(e){
    out.innerHTML="";
    msg.className="msg err show";
    msg.innerHTML="❌ SQLエラー: <code>"+e.message+"</code><br>下の「ヒント」を見るか「🤔 Claudeに聞く」を押してみよう。";
    return;
  }
  out.innerHTML=resultTable(userRes);
  // 採点
  let solRes;try{solRes=db.exec(ex.solution);}catch(e){solRes=null;}
  if(solRes && normalize(userRes,ex.ordered)===normalize(solRes,ex.ordered)){
    msg.className="msg ok show";msg.textContent="✅ 正解！ばっちりです。";
    solved[id]=true;localStorage.setItem("feather_solved",JSON.stringify(solved));
    $("#ex-"+id).classList.add("solved");$("#ok-"+id).textContent="✓ 解けた";
    renderNav();
  }else{
    msg.className="msg warn show";
    msg.innerHTML="🟡 動いたけど答えとは違うみたい。期待する列・条件・並び順を見直そう。ヒントもどうぞ。";
  }
}

function showHint(id,i,j){
  const ex=CONTENT.days[i].exercises[j];
  const box=$("#hint-"+id);
  let n=parseInt(box.dataset.n||"0");
  if(n>=ex.hints.length){box.innerHTML="💡 ヒントは以上です。「📖 解説」か「🤔 Claudeに聞く」を試してみて。";box.classList.add("show");return;}
  const shown=ex.hints.slice(0,n+1).map((h,k)=>`<div>💡 ヒント${k+1}: <code>${h}</code></div>`).join("");
  box.innerHTML=shown;box.classList.add("show");box.dataset.n=n+1;
}
function showExplain(id,i,j){
  const ex=CONTENT.days[i].exercises[j];
  const box=$("#exp-"+id);box.innerHTML="📖 解説: "+ex.explain;box.classList.add("show");
}
function askClaude(id,i,j){
  const ex=CONTENT.days[i].exercises[j];
  const sql=$("#ed-"+id).value.trim();
  const q=`SQLを学んでいます。次の問題で詰まっています。\n\n【問題】\n${ex.prompt.replace(/<[^>]+>/g,'')}\n\n【私の答え】\n${sql}\n\nどこが間違っているか、答えをすぐ教えず、ヒントを段階的にください。`;
  navigator.clipboard.writeText(q).then(()=>{
    toast("質問をコピーしました。Claudeに貼り付けてね");
    window.open("https://claude.ai/new","_blank");
  }).catch(()=>{
    alert("以下をコピーして Claude に貼り付けてください:\n\n"+q);
  });
}

function render(){
  renderNav();
  const m=$("#main");m.scrollTop=0;
  if(current===-1){m.innerHTML=CONTENT.intro+foot();window.scrollTo(0,0);return;}
  const d=CONTENT.days[current];
  let html=`<h2>${d.title}</h2><div class="daysub">${d.subtitle}</div>`;
  d.sections.forEach(s=>{html+=`<h3>${s.h}</h3>${s.html}`;});
  if(d.exercises.length){html+=`<h3>✍️ 演習</h3>`;}
  d.exercises.forEach((ex,j)=>{
    const id=`d${current}e${j}`;const done=solved[id];
    html+=`<div class="ex ${done?'solved':''}" id="ex-${id}">
      <div class="ex-h">演習 ${j+1} <span class="tag">${ex.ordered?'並び順あり':'SELECT'}</span><span class="ok" id="ok-${id}">${done?'✓ 解けた':''}</span></div>
      <div class="scene"><b>📍 こんな時に使う</b><br>${ex.scene}</div>
      <div class="ex-prompt"><b>🎯 やること:</b> ${ex.prompt}</div>
      <div class="dataline"><b>🗂 使うデータ:</b> ${ex.data}</div>
      <textarea class="editor" id="ed-${id}" spellcheck="false">${ex.starter}</textarea>
      <div class="btns">
        <button class="btn run" onclick="runExercise(${current},${j})">▶ 実行＆採点</button>
        <button class="btn ghost" onclick="showHint('${id}',${current},${j})">💡 ヒント</button>
        <button class="btn ghost" onclick="showExplain('${id}',${current},${j})">📖 解説</button>
        <button class="btn ghost" onclick="askClaude('${id}',${current},${j})">🤔 Claudeに聞く</button>
        <button class="btn ghost" onclick="document.getElementById('ed-${id}').value=CONTENT.days[${current}].exercises[${j}].starter">↺ リセット</button>
      </div>
      <div class="hint" id="hint-${id}" data-n="0"></div>
      <div class="explain" id="exp-${id}"></div>
      <div class="msg" id="msg-${id}"></div>
      <div id="out-${id}"></div>
      <div class="sowhat"><b>💡 この結果をどう使う:</b> ${ex.soWhat}</div>
    </div>`;
  });
  html+=foot();
  m.innerHTML=html;window.scrollTo(0,0);
}
function foot(){return `<div class="foot">🪶 feather Academy · ブラウザ内SQLite(sql.js)で実行 · 進捗はこのブラウザに自動保存されます</div>`;}
function go(i){current=i;render();}

initSqlJs({locateFile:f=>"https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/"+f})
.then(SQL=>{
  const bytes=Uint8Array.from(atob(DB_B64),c=>c.charCodeAt(0));
  db=new SQL.Database(bytes);
  current=-1;render();
})
.catch(e=>{
  $("#main").innerHTML=`<div class="loading">⚠️ SQLエンジンの読み込みに失敗しました。<br>
  インターネット接続を確認して再読み込みしてください。<br><br>
  <small>${e.message||e}</small></div>`;
});
</script>
</body>
</html>
"""

def main():
    html = TEMPLATE.replace("__CONTENT__", json.dumps(CONTENT, ensure_ascii=False))
    html = html.replace("__DB__", DB_B64)
    out = os.path.join(HERE, "textbook.html")
    with open(out, "w") as f:
        f.write(html)
    print(f"wrote {out} ({len(html)//1024} KB)")

if __name__ == "__main__":
    main()

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
    <div class="callout">
      <b>題材は人間データ(アノテーション)の品質オペレーション</b>——つまり Mercor の Quality PM の仕事そのもの。
      「どのアノテーターの品質が低いか」「なぜ棄却が多いか」を、自分のSQLで解き明かしていく。
    </div>
    <h3>データの全体像(5つのテーブル)</h3>
    <table class="dict">
      <tr><th>テーブル</th><th>意味</th><th>主な列</th></tr>
      <tr><td>annotators</td><td>作業者</td><td>annotator_id, name, country, tier, hired_date</td></tr>
      <tr><td>tasks</td><td>作業対象クリップ</td><td>task_id, batch, media_type, language, duration_sec, difficulty</td></tr>
      <tr><td>annotations</td><td>1人が1タスクを作業</td><td>annotation_id, task_id, annotator_id, time_spent_sec, num_segments</td></tr>
      <tr><td>segments</td><td>区間ごとのラベル</td><td>start_sec, end_sec, speaker, emotion, vocal_delivery</td></tr>
      <tr><td>audits</td><td>レビュー結果</td><td>quality_score, verdict, error_type</td></tr>
    </table>
    <p>左のメニューから Day 1 を選んでスタート。各 Day の演習を全部 ✓ にしていこう。</p>
  """,
  "days": [
    {
      "title": "Day 1 — データに触れる",
      "subtitle": "SELECT / WHERE / ORDER BY / LIMIT",
      "sections": [
        {"h":"1. SQLは「表への質問」", "html":"""
          <p>SQLは表(テーブル)から欲しい行を取り出す言語。基本の形はいつも同じ:</p>
          <pre class="sql">SELECT 列       -- 何を見たい?
FROM   テーブル  -- どの表から?
WHERE  条件     -- どの行に絞る?(任意)
ORDER BY 列     -- どう並べる?(任意)
LIMIT  件数;    -- 何件まで?(任意)</pre>
          <p>まずは下の演習で実際に動かしてみよう。エディタの「▶ 実行＆採点」を押すと結果が表で出る。</p>
        """},
      ],
      "exercises": [
        {
          "prompt":"<code>annotators</code> から <b>name と tier</b> の2列を5件表示しよう。",
          "starter":"SELECT ____, ____ FROM annotators LIMIT 5;",
          "solution":"SELECT name, tier FROM annotators LIMIT 5;",
          "ordered":False,
          "hints":["見たい列はカンマ区切りで並べる: SELECT a, b","SELECT name, tier FROM annotators LIMIT 5;"],
          "explain":"SELECT のあとに見たい列名をカンマで並べる。* は全列の意味だが、実務では必要な列だけ選ぶのが基本。"
        },
        {
          "prompt":"<code>annotators</code> から <b>tier が 'senior' の人</b>の name と tier を表示しよう。",
          "starter":"SELECT name, tier FROM annotators WHERE ____ = '____';",
          "solution":"SELECT name, tier FROM annotators WHERE tier='senior';",
          "ordered":False,
          "hints":["WHERE 列 = 値 の形。文字列はシングルクォートで囲む","データの中身は小文字。'Senior' ではなく 'senior'","SELECT name, tier FROM annotators WHERE tier='senior';"],
          "explain":"WHERE で行を絞る。= の前に比べる列名、後ろに値。値が文字列なら '...' で囲む。クォートの中身は大文字小文字を区別するので 'senior'(小文字)。"
        },
        {
          "prompt":"<code>tasks</code> から <b>difficulty が 'hard'</b> のタスクを、<b>duration_sec が長い順</b>に出そう(列: task_id, difficulty, duration_sec)。",
          "starter":"SELECT task_id, difficulty, duration_sec\nFROM tasks\nWHERE ____ = '____'\nORDER BY ____ ____;",
          "solution":"SELECT task_id, difficulty, duration_sec FROM tasks WHERE difficulty='hard' ORDER BY duration_sec DESC;",
          "ordered":True,
          "hints":["長い順=大きい順なので DESC","ORDER BY duration_sec DESC","SELECT task_id, difficulty, duration_sec FROM tasks WHERE difficulty='hard' ORDER BY duration_sec DESC;"],
          "explain":"WHERE で hard に絞り、ORDER BY duration_sec DESC で長い順に。DESC=降順(大→小)、ASC=昇順(省略時)。"
        },
        {
          "prompt":"🏢 実務問題:<code>audits</code> から <b>verdict が 'rejected'</b> の作業を、<b>品質スコアが低い順</b>に10件。これは『最優先で再レビューすべき作業』を出すクエリ(列: annotation_id, quality_score, verdict)。",
          "starter":"SELECT annotation_id, quality_score, verdict\nFROM audits\nWHERE ____\nORDER BY ____ ____\nLIMIT ____;",
          "solution":"SELECT annotation_id, quality_score, verdict FROM audits WHERE verdict='rejected' ORDER BY quality_score ASC LIMIT 10;",
          "ordered":True,
          "hints":["低い順=小さい順=ASC(省略も可)","LIMIT 10 で件数を絞る","SELECT annotation_id, quality_score, verdict FROM audits WHERE verdict='rejected' ORDER BY quality_score ASC LIMIT 10;"],
          "explain":"ORDER BY + LIMIT は『ワースト/ベストN件』の定番。品質が低い棄却作業から並べることで、対応の優先順位がつく。"
        },
      ],
    },
    {
      "title":"Day 2 — 数字を作る",
      "subtitle":"GROUP BY / 集計関数 / CASE",
      "sections":[
        {"h":"1. 集計関数 — 列を1つの数字に", "html":"""
          <p>COUNT(行数)・AVG(平均)・SUM(合計)・MIN/MAX で、たくさんの行を1つの数字に束ねる。</p>
          <pre class="sql">SELECT COUNT(*) FROM annotations;       -- 作業の総数
SELECT ROUND(AVG(quality_score),1) FROM audits;  -- 平均品質(小数1桁)</pre>"""},
        {"h":"2. GROUP BY — グループごとに", "html":"""
          <p>「全体」ではなく「○○ごと」に集計するのが GROUP BY。<b>SELECT に書く非集計列は GROUP BY にも書く</b>のが鉄則。</p>
          <pre class="sql">SELECT difficulty, COUNT(*) AS n
FROM tasks GROUP BY difficulty;</pre>"""},
        {"h":"3. CASE と割合", "html":"""
          <p>割合(%)は『条件に合う数 ÷ 全体』。<b>100.0 を掛けて小数にする</b>のを忘れると整数割り算で0になる罠。
          SQLite では <code>verdict='rejected'</code> 自体が 1/0 を返すので SUM できる。</p>
          <pre class="sql">SELECT ROUND(100.0*SUM(verdict='rejected')/COUNT(*),1) AS reject_pct
FROM audits;</pre>"""},
      ],
      "exercises":[
        {
          "prompt":"<code>audits</code> の <b>平均品質スコア</b>を小数1桁で出そう(列名は avg_q)。",
          "starter":"SELECT ROUND(____(quality_score), 1) AS avg_q FROM audits;",
          "solution":"SELECT ROUND(AVG(quality_score),1) AS avg_q FROM audits;",
          "ordered":False,
          "hints":["平均は AVG","SELECT ROUND(AVG(quality_score),1) AS avg_q FROM audits;"],
          "explain":"AVG で平均、ROUND(x,1) で小数1桁に丸める。AS で結果の列名を付けられる。"
        },
        {
          "prompt":"<code>audits</code> を <b>verdict ごとに件数</b>を数え、多い順に並べよう(列: verdict, n)。",
          "starter":"SELECT verdict, COUNT(*) AS n\nFROM audits\nGROUP BY ____\nORDER BY n ____;",
          "solution":"SELECT verdict, COUNT(*) AS n FROM audits GROUP BY verdict ORDER BY n DESC;",
          "ordered":True,
          "hints":["verdict ごとなので GROUP BY verdict","多い順=DESC","SELECT verdict, COUNT(*) AS n FROM audits GROUP BY verdict ORDER BY n DESC;"],
          "explain":"GROUP BY verdict で承認/軽微/棄却の3グループに分け、COUNT(*) で各グループの件数。これが品質の基本KPI。"
        },
        {
          "prompt":"🏢 <b>全体の棄却率(%)</b>を出そう(列名 reject_pct、小数1桁)。チームの最重要KPIの一つ。",
          "starter":"SELECT ROUND(100.0 * SUM(____='rejected') / COUNT(*), 1) AS reject_pct\nFROM audits;",
          "solution":"SELECT ROUND(100.0*SUM(verdict='rejected')/COUNT(*),1) AS reject_pct FROM audits;",
          "ordered":False,
          "hints":["条件は verdict='rejected'","100.0(小数)を掛けるのを忘れずに","SELECT ROUND(100.0*SUM(verdict='rejected')/COUNT(*),1) AS reject_pct FROM audits;"],
          "explain":"棄却数 ÷ 全体 × 100。SUM(verdict='rejected') は『棄却なら1, それ以外0』の合計=棄却数。100.0 にしないと整数割り算で 0 になる。"
        },
      ],
    },
    {
      "title":"Day 3 — 関係と順位",
      "subtitle":"JOIN / CTE / ウィンドウ関数",
      "sections":[
        {"h":"1. JOIN — テーブルを繋ぐ", "html":"""
          <p>品質は audits、名前は annotators、と情報が分かれている。<b>共通のキーで横に連結</b>するのが JOIN。</p>
          <pre class="sql">SELECT a.name, ad.quality_score
FROM annotations an
JOIN annotators a  ON a.annotator_id  = an.annotator_id
JOIN audits      ad ON ad.annotation_id = an.annotation_id;</pre>
          <p>an / a / ad はテーブルの別名(エイリアス)。長い名前を毎回書かずに済む。</p>"""},
        {"h":"2. JOIN + GROUP BY = アノテーター別の品質", "html":"""
          <p>Day2でできなかった本命。<b>これが Quality PM の中核クエリ</b>。HAVING で母数の少ない人を除外する。</p>"""},
      ],
      "exercises":[
        {
          "prompt":"<code>annotations</code> に <code>annotators</code> を JOIN して、<b>作業ID・名前・作業時間</b>を10件表示(列: annotation_id, name, time_spent_sec)。",
          "starter":"SELECT an.annotation_id, a.name, an.time_spent_sec\nFROM annotations an\nJOIN annotators a ON a.____ = an.____\nLIMIT 10;",
          "solution":"SELECT an.annotation_id, a.name, an.time_spent_sec FROM annotations an JOIN annotators a ON a.annotator_id=an.annotator_id LIMIT 10;",
          "ordered":False,
          "hints":["繋ぐキーは両テーブルの annotator_id","ON a.annotator_id = an.annotator_id","SELECT an.annotation_id, a.name, an.time_spent_sec FROM annotations an JOIN annotators a ON a.annotator_id=an.annotator_id LIMIT 10;"],
          "explain":"ON で『どの列が一致したら繋ぐか』を指定。annotations.annotator_id と annotators.annotator_id を突き合わせる。"
        },
        {
          "prompt":"🏢 <b>本命</b>:アノテーター別に <b>件数 n・平均品質 avg_q</b> を出し、<b>5件以上</b>に絞って品質の<b>低い順</b>に。(annotations + annotators + audits を JOIN)",
          "starter":"SELECT a.name, COUNT(*) AS n, ROUND(AVG(ad.quality_score),1) AS avg_q\nFROM annotations an\nJOIN annotators a  ON a.annotator_id  = an.annotator_id\nJOIN audits      ad ON ad.annotation_id = an.annotation_id\nGROUP BY a.annotator_id\nHAVING COUNT(*) >= ____\nORDER BY avg_q ____;",
          "solution":"SELECT a.name, COUNT(*) AS n, ROUND(AVG(ad.quality_score),1) AS avg_q FROM annotations an JOIN annotators a ON a.annotator_id=an.annotator_id JOIN audits ad ON ad.annotation_id=an.annotation_id GROUP BY a.annotator_id HAVING COUNT(*)>=5 ORDER BY avg_q ASC;",
          "ordered":True,
          "hints":["5件以上 = HAVING COUNT(*) >= 5","低い順 = ASC","...HAVING COUNT(*)>=5 ORDER BY avg_q ASC;"],
          "explain":"これで『再研修すべきアノテーターは誰か』が一発で出る。HAVING は集計後のグループを絞る(WHERE は集計前の行)。母数が少ない人を除くのが公平な評価の鍵。一番上に出た人が要注意。"
        },
      ],
    },
    {
      "title":"Day 4 — 判断する(統計)",
      "subtitle":"分布 / ばらつき / 中央値",
      "sections":[
        {"h":"1. 平均だけ見ると騙される", "html":"""
          <p>同じ平均でも、全員が近いのか・バラバラなのかで打ち手が変わる。だから<b>分布</b>を見る。
          CASE でスコアを階級(バンド)に分けると、SQLでも分布が見える。</p>"""},
      ],
      "exercises":[
        {
          "prompt":"品質スコアを <b>バンド別</b>に件数を数えよう(90以上 / 80-89 / 70-79 / 60-69 / それ未満)。分布の山がどこにあるか見える(列: band, n)。",
          "starter":"SELECT CASE\n  WHEN quality_score >= 90 THEN '90-100'\n  WHEN quality_score >= 80 THEN '80-89'\n  WHEN quality_score >= 70 THEN '70-79'\n  WHEN quality_score >= 60 THEN '60-69'\n  ELSE '< 60'\nEND AS band, COUNT(*) AS n\nFROM audits\nGROUP BY ____\nORDER BY band DESC;",
          "solution":"SELECT CASE WHEN quality_score>=90 THEN '90-100' WHEN quality_score>=80 THEN '80-89' WHEN quality_score>=70 THEN '70-79' WHEN quality_score>=60 THEN '60-69' ELSE '< 60' END AS band, COUNT(*) AS n FROM audits GROUP BY band ORDER BY band DESC;",
          "ordered":True,
          "hints":["CASE で作った別名 band でグループ化できる","GROUP BY band","...GROUP BY band ORDER BY band DESC;"],
          "explain":"CASE WHEN で連続値を階級に変換し、その階級でGROUP BY。山が低い方に寄っていればチーム全体の問題、特定の人だけ低いなら個人の問題——どこに手を打つかが変わる。"
        },
      ],
    },
    {
      "title":"Day 5-7 — 自動化・伝達・統合",
      "subtitle":"pandas / レポート / パイプライン",
      "sections":[
        {"h":"ここから先はターミナルで", "html":"""
          <p>Day 5〜7 は Python(pandas・matplotlib)を使うので、ブラウザ内では実行できない。
          リポジトリの <code>feather/learn/</code> で手を動かそう:</p>
          <ul>
            <li><b>Day 5 (pandas)</b>: <code>python3 solutions/day5.py</code> — 集計＋グラフ自動生成</li>
            <li><b>Day 6 (レポート)</b>: <code>solutions/day6_report_template.md</code> を埋める</li>
            <li><b>Day 7 (統合)</b>: <code>python3 solutions/run_all.py</code> — データ→分析→レポートを一括再生成</li>
          </ul>
          <div class="callout">最終的に『棄却率32%、棄却の56%が下位3名に集中』のような<b>成果レポート</b>が
          自動で出る。これがそのままポートフォリオになる。</div>
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
      <div class="ex-prompt">${ex.prompt}</div>
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

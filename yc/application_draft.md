# YC 応募 下書き（AgentData）

- 質問文は過去の応募フォームをもとにしています。**提出前に https://www.ycombinator.com/apply で実際の質問と締切を確認**してください。
- 【要記入】はあなたにしか書けない部分です。**事実だけを書くこと。** 数字を盛るとYCは見抜きますし、一発で落ちます。
- 英語は短く、具体的に、専門用語を使わずに書くのがYC流です。

---

## 0. 提出前に決めること

### 会社名
**「ADP」は使わないほうがいい。** アメリカの大手給与計算会社 ADP（Automatic Data Processing）と同じ名前で、商標でもまぎらわしいです。
→ 案: **AgentData**（プロトコル名としては "AgentData Protocol" のまま使えます）

### 一言説明（50文字以内）
案（どれか1つ）:
- `A marketplace where AI agents buy fresh data` (44)
- `Stripe for data sold to AI agents` (33)
- `AI agents bid for human-made data every 5 min` (45)

---

## 1. 会社について

### What is your company going to make? Please describe your product and what it does or will do.
（何を作るのか）

> AgentData is a marketplace where AI agents buy training data directly from the people who create it, with no human broker in between.
>
> Sellers — individuals and small businesses — connect with three lines of code and stream data such as Japanese Q&A pairs, game controller logs, or shop sales records. Every 5 minutes, the data collected is bundled into lots and sold in a sealed-bid auction. Buyer agents from AI companies look at each lot, decide what it is worth to them, and bid through our API. The winner pays the second-highest price, gets the data instantly, and 90% of the money goes back to the people who made the data.
>
> Today, buying data means sales calls, contracts, and months of waiting. We want it to work like Stripe: a few lines of code, and money and data move automatically.

### Where do you live now, and where would the company be based after YC?
【要記入】例: `Tokyo, Japan / San Francisco`

### How far along are you?
（どこまで進んでいるか）

> I have a working prototype: an auction server, a Python SDK for sellers and buyers, and buyer agents that use Claude to judge each lot's value and bid on their own. In a local demo, sellers stream Japanese Q&A data, several agents bid every round, lots settle at the second price, and payouts are split 90/10 in a ledger. Payments are simulated; there are no real users yet.
>
> 【要記入: 応募までに誰かと話せたら追加】例: `I have talked to N AI developers; M said they would pay for Japanese conversational data.`

### How long have each of you been working on this? How much of that has been full-time?
【要記入】正直に。例: `About 1 week, part-time.` （短くても問題ありません。嘘が問題です）

### What tech stack are you using, or planning to use?
> Python server and SDK today (standard library only). Buyer agents use the Claude API. Next: a hosted API, Postgres, Stripe Connect for payouts to sellers, and an MCP server so any agent can join the market.

### Are people using your product?
> Not yet. The prototype runs end-to-end locally.

### Do you have revenue?
> No.

### Why did you pick this idea to work on? Do you have domain expertise in this area? How do you know people need what you're making?
（なぜこのアイデアか。ここがあなたの一番の武器）

> 【要記入: micro1での役割を事実どおりに。守秘義務に触れる内容は書かない】
> 例: `I worked at micro1 on Japanese-language data for AI models, doing [具体的な仕事内容]. I saw two problems up close: AI companies struggle to get high-quality non-English data, and the people who actually create that data get paid a small share, slowly, through layers of middlemen.`
>
> `AI agents are starting to have budgets and to act on their own. They will need to buy data the same way they call an API — instantly, priced by what the data is worth to them. Nobody has built that market yet.`
>
> 【要記入: 需要の根拠。人と話した結果があれば最強】

### Who are your competitors? What do you understand about your business that they don't?
（競合と、自分だけが知っていること）

> Data labeling companies (Scale AI, Surge AI, micro1) sell custom data projects to large labs through sales teams. Data marketplaces (AWS Data Exchange, Snowflake Marketplace, Datarade) list static datasets for humans to browse and license. Hugging Face hosts free datasets.
>
> None of them are built for software buyers. We think the next buyer of data is an agent with a budget, not a procurement team. That buyer needs fresh data in small lots, a price it can decide in seconds, and an API it can call — and a sealed-bid second-price auction lets it simply bid what the data is worth.
>
> 【要記入: あなたが現場で知った、外からは見えない事実を1つ】例: 日本語データのどこが本当に足りないのか、など

### How do or will you make money? How much could you make?
> We take 10% of every sale.
>
> 【要記入 or 削除: 数字を使うなら根拠を書く。根拠のない市場規模は書かない】
> 例（考え方）: `If 1,000 buyer agents each spend $50 a day, that is $50k/day in sales and $5k/day to us.` ← 例として示すなら「仮定」だとわかる書き方で。

### If you had any other ideas you considered applying with, please list them.
【要記入 or 空欄】

---

## 2. 創業者について

### Are you looking for a cofounder?
> Yes — a technical cofounder who has built developer APIs or payment/marketplace systems.

### Please tell us about an impressive thing you have built or achieved.
【要記入】仕事でも個人でもOK。数字や結果があると強い。

### Please tell us about the time you most successfully hacked some (non-computer) system to your advantage.
【要記入】ルールの抜け道を見つけた・工夫で予想外の結果を出した話。

### Technical background
【要記入】正直に。例:
> `I am not a trained engineer. I built the prototype myself using AI coding tools (Claude Code), and I am looking for a technical cofounder to build the production system.`

（AIを使って自分で作ったことは正直に書いてOK。「自分で手を動かして形にした」はプラス評価になりえます）

---

## 3. 動画

### 創業者動画（1分）台本案
英語で、カメラに向かって自然に。原稿を読んでいる感が出ないように、何度か練習してから撮る。

> Hi, I'm 【名前】, founder of AgentData.
> 【経歴を1文】 At micro1, I worked on Japanese training data for AI, and I saw that great data is hard to buy, and the people who create it are paid late and little.
> AgentData is a market where AI agents buy data directly from its creators. Sellers connect in three lines of code, every five minutes the data is auctioned, agents bid through an API, and 90% of the money goes to the people who made it.
> I built a working prototype, and I'm looking for a technical cofounder. Thanks for watching.

### デモ動画（任意・1〜2分）
1. `python run_demo.py` を起動した画面（ターミナル＋ブラウザ http://127.0.0.1:8787）
2. 売り手の3行コードを見せる（`seller_japanese_qa.py`）
3. 買い手エージェントの判断理由が流れるところ（APIキーを設定してClaudeエージェントを参加させる）
4. SOLD → 売り手の収益が増えるところ
5. 画面だけのダッシュボード（Artifact）は「完成イメージ」として最後に一瞬だけ。**上部の架空の数字（総取引額など）が映らないように**するか、「イメージ」と明示する

---

## 4. 提出前チェックリスト

- [ ] 実際のフォームの質問・締切を確認した
- [ ] 【要記入】をすべて埋めた（または削除した）
- [ ] 架空の数字（ダッシュボードの $1.28M など）を実績として書いていない
- [ ] micro1の社内情報・データ・顧客名を書いていない（守秘義務の確認）
- [ ] 会社名を決めた（ADPは避ける）
- [ ] 創業者動画を撮った
- [ ] （できれば）AI開発者やデータを買いそうな人と2〜3人話して、その結果を書いた
- [ ] 英語をもう一度読み直した（Claudeにチェックを頼んでもOK）

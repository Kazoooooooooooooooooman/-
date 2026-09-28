# YC 応募 下書き（AgentData）

実際のフォームの順番に並べています。英語の回答はそのままコピペできる形にしてあります。

- 【要記入】はあなたにしか書けない部分です。**事実だけを書くこと。** 盛った数字はYCに見抜かれ、一発で落ちます。
- 締切は https://www.ycombinator.com/apply で確認してください。

---

## Founders（創業者）

### Who writes code, or does other technical work on your product? Was any of it done by a non-founder? Please explain.
（コードは誰が書いたか。創業者以外が関わったか）

> I do. I'm not a trained engineer, so I built the prototype by directing AI coding tools (mainly Claude Code): the auction server, the Python SDK, the buyer agents, and a concept dashboard. No non-founder has written code or done technical work on the product. I'm looking for a technical cofounder to build the production system.

（AIツールを使ったことは正直に書くのが正解。人間の外注やエンジニアの知人は関わっていない、という事実が大事です）

### Are you looking for a cofounder?
> Yes — a technical cofounder who has built developer APIs, payments, or marketplace systems.

### Founder Video（1分・100MB以内）
英語で、カメラに向かって自然に話す。原稿棒読みにならないよう何度か練習してから撮る。

> Hi, I'm 【名前】, founder of AgentData.
> At micro1, I worked on Japanese training data for AI 【役割を1文で】, and I saw that good data is hard to buy, and the people who create it are paid late and little.
> AgentData is a market where AI agents buy data directly from the people who make it. Sellers connect in three lines of code. Every five minutes, the data is auctioned, agents bid through an API, and 90% of the money goes to the creators.
> I built a working prototype, and I'm looking for a technical cofounder. Thanks for watching.

---

## Company（会社）

### Company name
> AgentData

（「ADP」は避ける。アメリカの大手給与計算会社 ADP と同じ名前で、商標上まぎらわしいため）

### Describe what your company does in 50 characters or less.
> A marketplace where AI agents buy fresh data

（44文字。別案: `Stripe for data sold to AI agents`）

### Company URL, if any
空欄でOK（まだない）

### If you have a demo, attach it below.（3分・100MB以内）
デモ動画の構成案（1〜2分）:
1. `python run_demo.py` のターミナルとブラウザ（http://127.0.0.1:8787）を並べて映す
2. 売り手の3行のコード（`seller_japanese_qa.py`）を見せる
3. Claudeエージェントが理由つきで入札するところ（APIキーを設定して参加させる）
4. SOLD → 売り手の収益が増えるところ
5. ダッシュボード（Artifact）は「完成イメージ」として最後に一瞬だけ。**上部の架空の数字（$1.28M など）は映さない**か、「コンセプト画面」と字幕を入れる

音声かテロップで「This is a local prototype. Payments are simulated.」と一言入れておくと誠実です。

### Please provide a link to the product, if any.
空欄でOK。
（Artifactのリンクは非公開なのでYCは開けません。GitHubを載せたい場合は、関係ないUSD/JPYのコードが入っていない、`protocol/` だけの公開リポジトリを別に作るのがおすすめ）

### If login credentials are required for the link above, enter them here.
空欄

### What is your company going to make? Please describe your product and what it does or will do.
> AgentData is a marketplace where AI agents buy training data directly from the people who create it, with no human broker in between.
>
> Sellers — individuals and small businesses — connect with three lines of code and stream data such as Japanese Q&A pairs, game controller logs, or shop sales records. Every 5 minutes, new data is bundled into lots and sold in a sealed-bid auction. Buyer agents from AI companies look at each lot, decide what it is worth to them, and bid through our API. The winner pays the second-highest price and gets the data right away, and 90% of the money goes back to the people who made it.
>
> Today, buying data means sales calls, contracts, and months of waiting. We want it to work like Stripe: a few lines of code, and money and data move automatically.

### Where do you live now, and where would the company be based after YC?
【要記入】形式どおりに。例: `Tokyo, Japan / San Francisco, USA`

### Explain your decision regarding location.
【要記入】例:
> `Most AI labs, our first buyers, are in San Francisco. I would keep close ties to Japan, where our first sellers and Japanese-language data come from.`

---

## Progress（進捗）

### How far along are you?
> I have a working prototype that runs end-to-end locally: an auction server, a Python SDK for sellers and buyers, and buyer agents that use Claude to judge each lot's value and bid on their own. In the demo, sellers stream Japanese Q&A data, several agents bid every round, lots settle at the second price, and payouts are split 90/10 in a ledger. Payments are simulated, and there are no real users yet.
>
> 【もし応募までに人と話せたら追加】例: `I have talked to N AI developers; M said they would pay for Japanese conversational data.`

### How long have each of you been working on this? How much of that has been full-time? Please explain.
【要記入】正直に。例:
> `About one week, part-time, alongside 【今の仕事など】.`

（期間が短いのは問題ない。嘘が問題）

### What tech stack are you using, or planning to use, to build this product? Include AI models and AI coding tools you use.
> Prototype: Python (standard library) for the auction server and SDK; React and Tailwind for a concept dashboard. Buyer agents use the Claude API (Claude Opus 5) to decide bids. I build with Claude Code as my AI coding tool.
>
> Planned: a hosted API with Postgres, Stripe Connect for payouts to sellers, automated PII removal and data quality checks, and an MCP server so any AI agent can join the market.

### Are people using your product?
> No

### Do you have revenue?
> No

### If you are applying with the same idea as a previous batch, did anything change? ...
初めての応募なら空欄

### If you have already participated or committed to participate in an incubator, "accelerator" or "pre-accelerator" program, please tell us about it.
【要記入】なければ空欄

---

## Idea（アイデア）

### Why did you pick this idea to work on? Do you have domain expertise in this area? How do you know people need what you're making?
（一番大事な質問。あなたの経験が武器になる）

> 【要記入: micro1での役割を事実どおりに。社内情報・顧客名は書かない】
> 例: `At micro1, I worked on Japanese-language data for AI models, doing [具体的な仕事内容]. I saw two problems up close: AI companies struggle to get good non-English data, and the people who create it get a small share, slowly, through layers of middlemen.`
>
> `AI agents are starting to have budgets and act on their own. They will need to buy data the same way they call an API: instantly, at a price set by what the data is worth to them. Nobody has built that market yet.`
>
> 【要記入: 需要の根拠。人と話した結果があれば最強。なければ正直に「これから検証する」と書く】

### Who are your competitors? What do you understand about your business that they don't?
> Data labeling companies (Scale AI, Surge AI, micro1) sell custom data projects to large labs through sales teams. Data marketplaces (AWS Data Exchange, Snowflake Marketplace, Datarade) list static datasets for people to browse and license. Hugging Face hosts free datasets.
>
> None of them are built for software buyers. We think the next buyer of data is an agent with a budget, not a procurement team. That buyer needs fresh data in small lots, a price it can decide in seconds, and an API it can call. A sealed-bid second-price auction fits this: the best strategy for each agent is simply to bid what the data is worth to it.
>
> 【要記入: 現場にいたあなただけが知っている事実を1つ。例: 日本語データで本当に足りないのはどの種類か】

### How do or will you make money? How much could you make?
> We take a 10% fee on every sale.
>
> 【数字を書くなら、仮定だとわかる形で。根拠のない市場規模は書かない】例:
> `If 1,000 buyer agents each spend $50 a day, that is $50k a day in sales and $5k a day in fees, about $1.8M a year. The ceiling is set by how much AI companies spend on data, which is growing fast as agents take over purchasing.`

### If you had any other ideas you considered applying with, please list them.
【要記入 or 空欄】
（YCは「こっちのアイデアで投資する」こともあるので、本当に考えたものがあれば書いたほうが得）

---

## Equity（株・会社）

### Have you formed ANY legal entity yet?
【要記入】まだなら `No`

### Have you taken any investment yet?
【要記入】まだなら `No`

### Are you currently fundraising?
【要記入】まだなら `No`

---

## Curious（その他）

### What convinced you to apply to Y Combinator? Did someone encourage you to apply? Have you been to any YC events?
【要記入】正直に。例:
> `I want to build this as a global company, and most of our first buyers, AI labs, work with YC companies. I haven't been to a YC event yet.`

### How did you hear about Y Combinator?
【要記入】例: `Online / Hacker News / a friend`

---

## 提出前チェックリスト

- [ ] 【要記入】をすべて埋めた（または空欄でいい質問は空欄にした）
- [ ] 架空の数字（ダッシュボードの $1.28M など）を実績として書いていない
- [ ] micro1の社内情報・データ・顧客名を書いていない
- [ ] 会社名を決めた（ADPは避ける）
- [ ] 創業者動画（1分）を撮った
- [ ] デモ動画を撮った（架空の数字が映っていない）
- [ ] （できれば）AIを作っている人やデータを買いそうな人と2〜3人話して、その結果を書いた
- [ ] 英語を読み直した

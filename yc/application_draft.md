# YC 応募回答（Seri / Winter 2027）

フォームの順番どおりです。英語の部分はそのままコピペできます。
**［確認］** がついている部分は、あなたの事実に合わせて直してください（違うまま出すのはNG）。

---

## Founders

**Who writes code, or does other technical work on your product? Was any of it done by a non-founder? Please explain.**

I do. I'm not a trained engineer, so I built the prototype by directing AI coding tools (mainly Claude Code): the auction server, the Python SDK, the buyer agents, and a concept dashboard. No non-founder has written code or done technical work on the product. I'm looking for a technical cofounder to build the production system.

**Are you looking for a cofounder?**

Yes. I'm looking for a technical cofounder who has built developer APIs, payments, or marketplace systems.

**Founder Video** → 下の「動画の台本」を使って撮影

---

## Company

**Company name**

Seri

**Describe what your company does in 50 characters or less.**

A marketplace where AI agents buy fresh data

**Company URL, if any** → 空欄

**If you have a demo, attach it below.** → デモ動画（下の構成案）

**Please provide a link to the product, if any.** → 空欄

**If login credentials are required for the link above, enter them here.** → 空欄

**What is your company going to make? Please describe your product and what it does or will do.**

Seri is a marketplace where AI agents buy data directly from the people who create it, anywhere in the world, with no human broker in between.

"Seri" is the Japanese word for the auctions at fish markets like Tsukiji, where each lot is sold in minutes before dawn. We do the same for data. Anyone who produces data can sell it: a gamer's controller logs in Seoul, an illustrator's pen strokes in Paris, a shop's sales records in São Paulo, conversations in any language. Sellers connect with three lines of code and stream their data. Every 5 minutes, new data is bundled into lots and sold in a sealed-bid auction. Buyer agents from AI companies look at each lot, decide what it is worth to them, and bid through our API. The winner pays the second-highest price and gets the data right away, and 90% of the money goes to the people who made it.

Today, buying data means sales calls, contracts, and months of waiting, and most of the world's data never gets sold at all. We want it to work like Stripe: a few lines of code, and money and data move automatically, between anyone on earth and any AI agent.

**Where do you live now, and where would the company be based after YC?**

Tokyo, Japan / San Francisco, USA ［確認: 住んでいる都市］

**Explain your decision regarding location.**

The AI labs that will be our first buyers are mostly in San Francisco, so the company should be there. I will keep close ties to Japan, where our first sellers and our Japanese-language data come from.

---

## Progress

**How far along are you?**

I have a working prototype that runs end to end locally: an auction server, a Python SDK for sellers and buyers, and buyer agents that use Claude to judge each lot's value and bid on their own. In the demo, sellers stream Japanese Q&A data, several agents bid every round, lots settle at the second-highest price, and payouts are split 90/10 in a ledger. Payments are simulated, and there are no real users yet.

**How long have each of you been working on this? How much of that has been full-time? Please explain.**

About one week, part-time. ［確認: 実際の期間と、ほかの仕事や学業との両立状況を一言足す］

**What tech stack are you using, or planning to use, to build this product? Include AI models and AI coding tools you use.**

Prototype: Python (standard library only) for the auction server and SDK, and React with Tailwind for a concept dashboard. Buyer agents use the Claude API (Claude Opus 5) to decide how much to bid. I build with Claude Code.

Planned: a hosted API on Postgres, Stripe Connect for payouts to sellers, automated removal of personal information and data quality checks, and an MCP server so any AI agent can join the market.

**Are people using your product?** → No

**Do you have revenue?** → No

**If you are applying with the same idea as a previous batch...** → 空欄（初めての応募なら）

**If you have already participated or committed to participate in an incubator...** → 空欄（参加したことがなければ）

---

## Idea

**Why did you pick this idea to work on? Do you have domain expertise in this area? How do you know people need what you're making?**

I worked at micro1 on labelling Japanese-language data for AI models. I saw two problems up close. AI companies struggle to get good data outside English, and the people who create that data are paid a small share, slowly, through layers of middlemen.

I also saw the other side through two friends, young founders who collect data for AI. They can produce good data quickly, but they struggle to find anyone to sell it to. Selling data today means finding buyers one by one, cold emails, and long negotiations, which small teams can't afford. I want a place where anyone who makes data can sell it the moment it exists.

At the same time, AI agents are starting to get budgets and act on their own. They will need to buy data the same way they call an API: instantly, at a price set by what the data is worth to them. Nobody has built that market yet.

I haven't validated demand with paying buyers yet. My next steps are to put my friends' data on Seri as the first supply, and to talk to AI teams that need non-English data and get them to bid on real lots.

**Who are your competitors? What do you understand about your business that they don't?**

Data labeling companies (Scale AI, Surge AI, micro1) sell custom data projects to large labs through sales teams. Data marketplaces (AWS Data Exchange, Snowflake Marketplace, Datarade) list static datasets for people to browse and license. Hugging Face hosts free datasets.

None of them are built for software buyers. We think the next buyer of data is an agent with a budget, not a procurement team. That buyer needs fresh data in small lots, a price it can decide in seconds, and an API it can call. A sealed-bid second-price auction fits this well: the best strategy for each agent is simply to bid what the data is really worth to it, so prices reflect true value without negotiation.

**How do or will you make money? How much could you make?**

We take a 10% fee on every sale.

As an example: if 1,000 buyer agents each spend $50 a day, that is $50k a day in sales and $5k a day in fees, or about $1.8M a year. The real ceiling is how much AI companies spend on data, and that spend moves to us as agents take over purchasing.

**If you had any other ideas you considered applying with, please list them.** → 空欄（ほかに本気で考えたアイデアがあれば書くと得）

---

## Equity ［確認: 違えば変える］

**Have you formed ANY legal entity yet?** → No

**Have you taken any investment yet?** → No

**Are you currently fundraising?** → No

**If you have not formed the company yet, describe the planned equity ownership breakdown...**

Kazuma Sasaki, CEO: 100% today, as the only founder.

When a technical cofounder joins as CTO, I plan to give them a large share, around 40-50%, because they will build the production system and should own it as a real partner. Both of us will vest over 4 years with a 1-year cliff. We plan to set aside about 10% as an option pool for early employees. There are no other proposed stockholders.

［確認: CTOに渡す割合はあなたが決めること］

---

## Curious

**What convinced you to apply to Y Combinator? Did someone encourage you to apply? Have you been to any YC events?**

I want to build Seri as a global company from day one, and the AI companies that will be our first buyers are in San Francisco, many of them started at YC. Nobody pushed me to apply; I decided to after building the prototype. I haven't been to a YC event yet. ［確認: 誰かに勧められた、イベントに行ったことがあるなら書き換える］

**How did you hear about Y Combinator?**

［要記入: 例 `Online, through startup news and Hacker News.`］

---

## Batch Preference

**What batch do you want to apply for?** → Winter 2027

---

## 動画の台本（創業者動画・1分）

> Hi, I'm Kazuma Sasaki, founder of Seri.
> I worked at micro1 on Japanese training data for AI, and I saw that good data is hard to buy, and the people who create it are paid late and little.
> "Seri" is the Japanese word for the fish market auctions at Tsukiji, where every lot sells in minutes. Seri does that for data. Sellers connect in three lines of code, every five minutes their data is auctioned, AI agents bid through an API, and 90% of the money goes to the people who made it.
> I built a working prototype, and I'm looking for a technical cofounder. Thanks for watching.

## デモ動画の構成（1〜2分）

1. `python run_demo.py` のターミナルと、ブラウザの http://127.0.0.1:8787 を並べて映す
2. 売り手の3行のコード（`seller_japanese_qa.py`）を見せる
3. Claudeエージェントが理由つきで入札するところ（APIキーを設定して参加させる）
4. SOLD → 売り手の収益が増えるところ
5. テロップで「Local prototype. Payments are simulated.」
6. ダッシュボード（Artifact）を使うなら、上部の架空の数字は映さない

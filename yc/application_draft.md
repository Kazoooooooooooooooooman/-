# YC 応募回答（Seri / Winter 2027）

フォームの順番どおり。英語はそのままコピペOK。
**［確認］** は事実に合わせて直すこと（違うまま出すのはNG）。

---

## Founders

**Who writes code, or does other technical work on your product? Was any of it done by a non-founder? Please explain.**

Me. I'm not a trained engineer; I built the prototype myself with AI coding tools (Claude Code): the auction server, the SDK, and the buyer agents. No non-founder has touched the code. I'm recruiting a technical cofounder for production.

**Are you looking for a cofounder?**

Yes. A technical cofounder who has shipped APIs, payments, or marketplaces.

**Founder Video** → 下の台本で撮影

---

## Company

**Company name:** Seri

**Describe what your company does in 50 characters or less.**

A marketplace where AI agents buy fresh data

**Company URL / Product link / Login** → 空欄

**Demo** → 下の構成でデモ動画

**What is your company going to make?**

Seri is a marketplace where AI agents buy data straight from the people who create it. No brokers, no contracts.

"Seri" is Japanese for the fish-market auctions at Tsukiji, where each lot sells in minutes. We do that for data. Anyone, anywhere can sell: a gamer in Seoul, an illustrator in Paris, a shop in São Paulo. Sellers connect in three lines of code. Every 5 minutes, fresh data goes to a sealed-bid auction. AI agents price each lot and bid through our API. The winner pays the second-highest bid and gets the data instantly. 90% goes to the creators.

Buying data today takes sales calls and months. Most of the world's data is never sold at all. Seri makes it as simple as Stripe.

**Where do you live now, and where would the company be based after YC?**

Tokyo, Japan / San Francisco, USA

**Explain your decision regarding location.**

Our buyers, the AI labs, are in SF. Our first sellers are in Japan. We build in SF and keep a base in Tokyo.

---

## Progress

**How far along are you?**

Working end-to-end prototype: an auction server, a Python SDK, and Claude-powered buyer agents that price each lot and bid on their own. Lots settle every round; payouts split 90/10 in a ledger. Payments are simulated. No users yet.

**How long have each of you been working on this?**

About one week, part-time. ［確認］

**What tech stack are you using?**

Now: Python, the Claude API (Claude Opus 5) for buyer agents, React and Tailwind for the dashboard. Built with Claude Code.
Next: hosted API, Postgres, Stripe Connect payouts, automated PII removal, and an MCP server so any agent can plug in.

**Are people using your product?** → No

**Do you have revenue?** → No

**Previous batch / Incubator** → 空欄

---

## Idea

**Why did you pick this idea to work on? Do you have domain expertise in this area? How do you know people need what you're making?**

I watched a deal die inside the company I worked for.

At 20, I became the Japanese QA lead at micro1, setting quality standards for a multilingual audio pipeline used to train frontier AI models. A friend runs Kataro, a company that sells Japanese voice data, and asked me if micro1 would buy it. I knew the demand was real; I was reviewing that kind of data every day. I messaged the CEO and the head of human data directly. The CEO never replied. The data manager said he'd check. A month later: nothing.

The buyer needed the data. The seller had it. The deal died waiting on a human.

That's the data market today: cold DMs, sales calls, weeks of silence. Meanwhile, AI agents are getting budgets. So give every AI company an agent that knows exactly what data it needs, and let it buy on the spot at a fair price. And make it as simple as Stripe: three lines of code on each side.

I've made money on this gap before: $30,000 in four months as an AI data reviewer, then $20,000 more by connecting underpaid Japanese students to the same work.

Not yet validated with paying buyers. Next: list Kataro's voice data as the first supply and get AI teams bidding on real lots. ［確認: Kataroは出品に同意している？］

**Who are your competitors? What do you understand about your business that they don't?**

Scale AI, Surge AI, and micro1 sell custom data projects to big labs through sales teams. AWS Data Exchange, Snowflake Marketplace, and Datarade list static datasets for humans to browse. Hugging Face gives datasets away.

All of them are built for human buyers. The next buyer of data is an agent with a budget. It needs fresh data in small lots, a price in seconds, and an API. A sealed-bid second-price auction is built for exactly that: an agent's best move is to bid its true value. No negotiation.

**How do or will you make money? How much could you make?**

10% of every sale, and the goal is $1B a year. The math: 20,000 buyer agents (for example, 2,000 AI teams running 10 agents each) spending $1,400 a day is $10.2B a year in data sales and $1.02B in fees. That's ambitious but not crazy: the leading human-data companies already earn over $1B a year selling by hand. As agents take over buying, that spend moves onto rails like ours.

**If you had any other ideas you considered applying with, please list them.**

Trade and Error (tradeanderror.com): the flight recorder for traders. Exchanges record what people trade; we record why. Traders record their live trades and replay them as a quiz, calling the next move before it's revealed. About 10 traders use it. Next: AI that scores every trade and names the habits behind losses. With consent, the anonymized data becomes datasets for AI companies and indicators for investors. Long term: the world's largest record of how humans actually trade.

---

## Equity ［確認: 違えば変える］

**Have you formed ANY legal entity yet?** → No

**Have you taken any investment yet?** → No ［確認: SMBCの400万円がこの会社向けならYes］

**Are you currently fundraising?** → No

**Planned equity breakdown**

Kazuma Sasaki, CEO: 100% today. A technical cofounder (CTO) will get 40–50%. Both vest over 4 years with a 1-year cliff. About 10% reserved as an option pool for early hires.

---

## Curious

**What convinced you to apply to Y Combinator?**

I'm building Seri as a global company from day one, and our buyers, the AI labs, are in SF; many of them came out of YC. I decided to apply after building the prototype. No YC events yet. ［確認］

**How did you hear about Y Combinator?**

［要記入: 例 `Online, through Hacker News and startup media.`］

---

## Batch Preference → Winter 2027

---

## Accomplishments

**Please tell us about a time you most successfully hacked some (non-computer) system to your advantage.**

Three:

1. The AI data gold rush. I spotted early that AI companies paid Japanese reviewers far more than any student job. I made $30,000 in four months. Then I connected underpaid Japanese students to the same work and made another $20,000 in referrals. ［確認: 公式の紹介制度？］

2. AI interviewers. Their follow-up questions leaked the answer they wanted. I gave it back in their own words and passed.

3. Japanese finance law. Starting a brokerage as a young founder is nearly impossible. Prop firms like FTMO and FINTOKEI run on challenge fees and simulated capital, with no customer funds at risk. So I built and ran one: Samurai Traders.

**Please tell us in one or two sentences about the most impressive thing other than this startup that you have built or achieved.**

Became the Japanese QA lead at micro1 at 20: I designed the reviewer workflow and scoring rubrics from scratch and trained annotators to frontier-lab quality bars. Secured ¥4M (about $27,000) from SMBC, one of Japan's three megabanks, for ［確認: どの事業か／出資か融資か］.

**Tell us about things you've built before.**

- Trade and Error (https://tradeanderror.com): trade recording and quiz-style replay for retail traders. About 10 active users.
- Samurai Traders (samuraitraders.com): a prop trading firm for Japanese traders. Closed.
- Playlingual: a soccer school taught in English. Closed.
- Seri prototype: auction server, SDK, and Claude-powered buyer agents.

**List any competitions/awards you have won, or papers you've published.**

- Champion, Tokyo Division 3 soccer league ［確認: 正式名］
- 14,000 trophies in Clash Royale

**List any relevant or impressive test scores.**

IELTS 7.5

**List any entrepreneurship programs, clubs, or hacker houses you have participated in.**

None.

---

## 創業者動画の台本（1分）

> I'm Kazuma Sasaki, founder of Seri.
> Seri is a marketplace where AI agents buy data directly from the people who make it. Sellers plug in with three lines of code. Every five minutes, AI agents bid on fresh data, and 90% goes to the creators.
> Why? I was the Japanese QA lead at micro1. A friend's company had exactly the Japanese voice data we needed. I messaged our CEO. No reply. A month later, still nothing. The buyer needed it, the seller had it, and the deal died waiting on a human.
> Seri removes that wait. Every AI company gets an agent that knows what data it needs and buys it on the spot.
> In Japan, "seri" is the fish-market auction where every lot sells in minutes. We do that for data.
> The prototype works, and I'm looking for a technical cofounder.

## デモ動画の構成（1〜2分）

1. `python run_demo.py` のターミナルと、ブラウザの http://127.0.0.1:8787 を並べて映す
2. 売り手の3行のコード（`seller_japanese_qa.py`）を見せる
3. Claudeエージェントが理由つきで入札するところ
4. SOLD → 売り手の収益が増えるところ
5. テロップ「Local prototype. Payments are simulated.」
6. ダッシュボード（Artifact）を使うなら、上部の架空の数字は映さない

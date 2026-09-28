"""あなたのAIエージェント: Claudeが出品データを見て、自分で入札額を決める。

  1. 開いているロットを見る
  2. Claudeに「自分の目的と予算からすると、いくら出す？」と聞く
  3. Claudeの判断どおりに封印入札する
  4. 落札したらデータをダウンロードして、予算を減らす
これを人間の操作なしでくり返します。

準備:  pip install anthropic
       export ANTHROPIC_API_KEY="sk-ant-..."   （Windowsは set ANTHROPIC_API_KEY=...）
実行:  python buyer_claude.py
"""

import json
import time
from pathlib import Path

import anthropic

import adp

# ---- ここを書き換えると、エージェントの性格が変わります ----
NAME = "Kaz-JP-Data-Agent"
GOAL = "日本語の自然な会話やビジネス敬語に強いAIアシスタントを作るため、高品質な日本語データを集めたい"
POLICY = "日本語データには積極的。日本語と関係ないデータは原則見送る。1ロットに予算の3割以上は使わない"
BUDGET_USD = 100.0
MODEL = "claude-opus-5"
# ------------------------------------------------------------

DECISION_SCHEMA = {
    "type": "object",
    "properties": {
        "bid": {"type": "boolean", "description": "入札するならtrue、見送るならfalse"},
        "amount_usd": {"type": "number", "description": "入札額（ドル）。見送る場合は0"},
        "reason": {"type": "string", "description": "判断理由（日本語で60文字以内）"},
    },
    "required": ["bid", "amount_usd", "reason"],
    "additionalProperties": False,
}

client = anthropic.Anthropic()  # ANTHROPIC_API_KEY を自動で読みます
market = adp.buyer(NAME)
budget = BUDGET_USD
seen_lots = set()
seen_results = set()
downloads = Path(__file__).parent / "downloads"


def decide(lot):
    """Claudeに1つのロットの価値を判断させる。"""
    prompt = f"""あなたは「{NAME}」という自律AI購入エージェントです。人間の確認なしで、AI学習用データを買い付けます。
目的: {GOAL}
方針: {POLICY}
残り予算: ${budget:.2f}

封印入札オークションに次のロットが出ています。
- スキーマ: {lot['schema']}
- レコード数: {lot['records']} / 提供者数: {lot['suppliers']}
- 最低落札価格: ${lot['reserve_usd']:.2f}
- 中身の例: {lot['preview']}

ルール: 他のエージェントの入札額は見えません。最高額の入札者が落札し、支払うのは2番目に高い入札額（なければ最低落札価格）です。
なので、あなたにとっての本当の価値をそのまま入札するのが最も得です。価値が最低落札価格より低い、目的に合わない、予算を超える場合は見送ってください。"""

    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",  # 安全フィルターで断られたとき、別モデルで自動再実行
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": DECISION_SCHEMA}},
        messages=[{"role": "user", "content": prompt}],
    )
    if response.stop_reason == "refusal":
        return {"bid": False, "amount_usd": 0, "reason": "Claudeが判断を辞退しました"}
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)


def check_results():
    """落札結果を見て、自分が勝ったロットのデータを受け取る。"""
    global budget
    for r in market.results():
        if r["lot_id"] in seen_results or r["lot_id"] not in seen_lots:
            continue
        seen_results.add(r["lot_id"])
        if r["winner"] != NAME:
            print(f"  × {r['lot_id']} は落札できず（勝者: {r['winner'] or 'なし'}）")
            continue
        budget -= r["price_usd"]
        records = market.download(r["lot_id"])
        downloads.mkdir(exist_ok=True)
        path = downloads / f"{r['lot_id']}.json"
        path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  ★ {r['lot_id']} を ${r['price_usd']:.2f} で落札！ {len(records)}件を {path.name} に保存（残り予算 ${budget:.2f}）")


print(f"{NAME} 起動（予算 ${budget:.2f}, モデル {MODEL}）")
while True:
    try:
        check_results()
        for lot in market.lots():
            if lot["id"] in seen_lots:
                continue
            seen_lots.add(lot["id"])
            d = decide(lot)
            amount = round(min(float(d["amount_usd"]), budget), 2)
            if d["bid"] and amount >= lot["reserve_usd"]:
                market.bid(lot["id"], amount)
                print(f"→ {lot['id']} ({lot['schema']}) に ${amount:.2f} で封印入札: {d['reason']}")
            else:
                print(f"→ {lot['id']} ({lot['schema']}) は見送り: {d['reason']}")
    except anthropic.AuthenticationError:
        raise SystemExit("APIキーが正しくありません。ANTHROPIC_API_KEY を確認してください。")
    except anthropic.RateLimitError:
        print("Claudeの利用上限に達しました。30秒待ちます。")
        time.sleep(30)
    except anthropic.APIConnectionError:
        print("Claudeに接続できません。ネット接続を確認してください。")
    except anthropic.APIStatusError as e:
        print(f"Claude APIエラー ({e.status_code}): {e.message}")
    except adp.ADPError as e:
        print(f"ADP: {e}")
    time.sleep(3)

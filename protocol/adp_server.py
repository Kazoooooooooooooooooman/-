"""ADP server — the auction house in the middle.

Every round (default 5 minutes):
  1. Lots that were open are closed: sealed-bid second-price auction
     (highest bid wins, pays the runner-up's bid or the reserve).
     The price is split 90% to the sellers (by record count), 10% protocol fee.
  2. Records sellers published during the round become new lots, one per schema.

Run:  python adp_server.py            (5-minute rounds)
      python adp_server.py --round 20 (20-second rounds for a demo)
Then open http://127.0.0.1:8787 in a browser.

Payments are recorded in a local ledger (ledger.jsonl); no real money moves.
"""

import argparse
import hashlib
import json
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

RESERVE_USD = 10.0
PROTOCOL_FEE = 0.10
MAX_BODY = 1_000_000
HERE = Path(__file__).parent


def now():
    return time.time()


def pseudonym(api_key):
    """Buyers never see a seller's key; they see a stable pseudonym."""
    return "supplier_" + hashlib.sha256(api_key.encode()).hexdigest()[:8]


def color(text, code):
    return f"\033[{code}m{text}\033[0m"


class Market:
    def __init__(self, round_seconds):
        self.round_seconds = round_seconds
        self.lock = threading.Lock()
        self.pending = {}  # schema -> [record]
        self.lots = {}  # lot_id -> lot
        self.open_ids = []
        self.results = []  # newest first
        self.earned = {}  # seller api_key -> usd
        self.spent = {}  # buyer name -> usd
        self.fees = 0.0
        self.lot_seq = 0
        self.round_started = now()
        self.ledger = HERE / "ledger.jsonl"

    # ---------- sellers ----------
    def add_record(self, body):
        api_key = str(body.get("api_key", "")).strip()
        schema = str(body.get("schema", "")).strip()
        if not api_key or not schema:
            raise ValueError("api_key と schema は必須です")
        if "features" not in body:
            raise ValueError("features が空です")
        floor = float(body.get("floor_usd", RESERVE_USD))
        rec = {
            "id": "rec_" + uuid.uuid4().hex[:10],
            "api_key": api_key,
            "schema": schema,
            "features": body["features"],
            "meta": body.get("meta") or {},
            "floor_usd": max(RESERVE_USD, floor),
            "t": now(),
        }
        with self.lock:
            self.pending.setdefault(schema, []).append(rec)
        print(color(f"  ↓ record  {schema:<16} from {pseudonym(api_key)}", "2"))
        return rec["id"]

    # ---------- buyers ----------
    def lot_view(self, lot):
        suppliers = {r["api_key"] for r in lot["records"]}
        return {
            "id": lot["id"],
            "schema": lot["schema"],
            "records": len(lot["records"]),
            "suppliers": len(suppliers),
            "reserve_usd": lot["reserve_usd"],
            "closes_at": lot["closes_at"],
            "closes_in_s": max(0, round(lot["closes_at"] - now())),
            "sealed_bids": len(lot["bids"]),
            "preview": [json.dumps(r["features"], ensure_ascii=False)[:160] for r in lot["records"][:2]],
        }

    def open_lots(self):
        with self.lock:
            return [self.lot_view(self.lots[i]) for i in self.open_ids]

    def place_bid(self, lot_id, body):
        buyer = str(body.get("buyer", "")).strip()
        try:
            amount = round(float(body.get("amount_usd")), 2)
        except (TypeError, ValueError):
            raise ValueError("amount_usd は数値で指定してください")
        if not buyer:
            raise ValueError("buyer（エージェント名）は必須です")
        with self.lock:
            lot = self.lots.get(lot_id)
            if not lot or lot_id not in self.open_ids:
                raise ValueError("このロットは入札を受け付けていません（終了済みか存在しません）")
            if amount < lot["reserve_usd"]:
                raise ValueError(f"最低落札価格 ${lot['reserve_usd']:.2f} 未満です")
            lot["bids"][buyer] = {"amount_usd": amount, "t": now()}
        print(color(f"  🔒 sealed bid on {lot_id} by {buyer}", "36"))
        return {"ok": True, "lot_id": lot_id, "buyer": buyer, "amount_usd": amount}

    def delivery(self, lot_id, buyer):
        with self.lock:
            lot = self.lots.get(lot_id)
            if not lot or lot.get("winner") != buyer:
                raise PermissionError("このロットを落札したエージェントだけがダウンロードできます")
            return [
                {"id": r["id"], "supplier": pseudonym(r["api_key"]), "features": r["features"], "meta": r["meta"]}
                for r in lot["records"]
            ]

    # ---------- the 5-minute clock ----------
    def run_round(self):
        with self.lock:
            closing = [self.lots[i] for i in self.open_ids]
            self.open_ids = []
            for lot in closing:
                self._settle(lot)
            t = now()
            self.round_started = t
            for schema, records in sorted(self.pending.items()):
                if not records:
                    continue
                self.lot_seq += 1
                lot = {
                    "id": f"lot_{self.lot_seq:06d}",
                    "schema": schema,
                    "records": records,
                    "reserve_usd": max(r["floor_usd"] for r in records),
                    "opened_at": t,
                    "closes_at": t + self.round_seconds,
                    "bids": {},
                    "winner": None,
                }
                self.lots[lot["id"]] = lot
                self.open_ids.append(lot["id"])
                print(color(f"▶ OPEN  {lot['id']} {schema} · {len(records)} records · reserve ${lot['reserve_usd']:.2f}", "35;1"))
            self.pending = {}

    def _settle(self, lot):
        bids = sorted(lot["bids"].items(), key=lambda kv: (-kv[1]["amount_usd"], kv[1]["t"]))
        if not bids:
            print(color(f"■ CLOSE {lot['id']} · no bids", "2"))
            result = {"lot_id": lot["id"], "schema": lot["schema"], "winner": None, "price_usd": 0, "bids": 0, "t": now()}
        else:
            winner, top = bids[0]
            price = bids[1][1]["amount_usd"] if len(bids) > 1 else lot["reserve_usd"]
            fee = round(price * PROTOCOL_FEE, 2)
            pool = price - fee
            counts = {}
            for r in lot["records"]:
                counts[r["api_key"]] = counts.get(r["api_key"], 0) + 1
            total = sum(counts.values())
            payouts = {k: round(pool * n / total, 4) for k, n in counts.items()}
            for k, v in payouts.items():
                self.earned[k] = round(self.earned.get(k, 0) + v, 4)
            self.spent[winner] = round(self.spent.get(winner, 0) + price, 2)
            self.fees = round(self.fees + fee, 2)
            lot["winner"] = winner
            result = {
                "lot_id": lot["id"],
                "schema": lot["schema"],
                "winner": winner,
                "winning_bid_usd": top["amount_usd"],
                "price_usd": price,
                "fee_usd": fee,
                "bids": len(bids),
                "records": total,
                "suppliers": len(counts),
                "t": now(),
            }
            print(color(f"■ SOLD  {lot['id']} → {winner}  bid ${top['amount_usd']:.2f} · pays ${price:.2f} · {len(bids)} bids", "32;1"))
            ledger_row = dict(result, payouts={pseudonym(k): v for k, v in payouts.items()})
            with self.ledger.open("a", encoding="utf-8") as f:
                f.write(json.dumps(ledger_row, ensure_ascii=False) + "\n")
        self.results.insert(0, result)
        del self.results[50:]

    def clock(self):
        while True:
            time.sleep(max(0.2, self.round_started + self.round_seconds - now()))
            self.run_round()

    def state(self):
        with self.lock:
            return {
                "round_seconds": self.round_seconds,
                "next_round_in_s": max(0, round(self.round_started + self.round_seconds - now())),
                "pending": {k: len(v) for k, v in self.pending.items()},
                "open_lots": [self.lot_view(self.lots[i]) for i in self.open_ids],
                "results": self.results[:20],
                "sellers": {pseudonym(k): v for k, v in sorted(self.earned.items(), key=lambda kv: -kv[1])},
                "buyers": dict(sorted(self.spent.items(), key=lambda kv: -kv[1])),
                "protocol_fees_usd": self.fees,
            }


STATUS_PAGE = """<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ADP Server</title>
<style>
body{margin:0;padding:24px 16px;background:#07070B;color:#ECECF3;font:14px/1.5 system-ui,sans-serif}
main{max-width:1100px;margin:auto;display:grid;gap:16px}h1{margin:0;font-size:22px}h1 b{color:#8C86FF}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
section{border:1px solid #1F1F2C;background:#0D0D14;border-radius:12px;padding:14px;min-width:0}
h2{margin:0 0 8px;font-size:13px;color:#8B8BA3;letter-spacing:.08em;text-transform:uppercase}
.row{font:12px/1.6 ui-monospace,Menlo,monospace;padding:4px 0;border-top:1px solid #16161F;overflow-wrap:anywhere}
.ok{color:#2EE6A8}.dim{color:#5B5B72}.p{color:#8C86FF}
</style></head><body><main>
<h1>AgentData Protocol <b>server</b> <span class="dim" id="clock"></span></h1>
<div class="grid">
<section><h2>入札受付中のロット</h2><div id="lots"></div></section>
<section><h2>落札結果</h2><div id="results"></div></section>
<section><h2>売り手の収益（90%）</h2><div id="sellers"></div></section>
<section><h2>買い手AIの支払い</h2><div id="buyers"></div></section>
</div></main>
<script>
const $=id=>document.getElementById(id), e=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
async function tick(){try{const s=await (await fetch('/v1/state')).json();
$('clock').textContent=`· 次のラウンドまで ${s.next_round_in_s}s · 手数料 $${s.protocol_fees_usd.toFixed(2)}`;
$('lots').innerHTML=s.open_lots.map(l=>`<div class=row><span class=p>${l.id}</span> ${e(l.schema)} · ${l.records}件 / ${l.suppliers}人 · 🔒${l.sealed_bids}件 · 残り${l.closes_in_s}s</div>`).join('')||'<div class="row dim">なし（売り手のデータ待ち）</div>';
$('results').innerHTML=s.results.map(r=>r.winner?`<div class=row><span class=ok>SOLD</span> ${r.lot_id} ${e(r.schema)} → <b>${e(r.winner)}</b> 入札$${r.winning_bid_usd.toFixed(2)} 支払い$${r.price_usd.toFixed(2)}</div>`:`<div class="row dim">${r.lot_id} 入札なし</div>`).join('')||'<div class="row dim">まだありません</div>';
$('sellers').innerHTML=Object.entries(s.sellers).map(([k,v])=>`<div class=row>${k} <span class=ok>$${v.toFixed(2)}</span></div>`).join('')||'<div class="row dim">まだありません</div>';
$('buyers').innerHTML=Object.entries(s.buyers).map(([k,v])=>`<div class=row>${e(k)} $${v.toFixed(2)}</div>`).join('')||'<div class="row dim">まだありません</div>';
}catch(err){$('clock').textContent='· サーバー停止中'}}
tick();setInterval(tick,1500);
</script></body></html>"""


def make_handler(market):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):  # keep the console for market events
            pass

        def send(self, code, obj=None, html=None):
            data = html.encode("utf-8") if html is not None else json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "text/html; charset=utf-8" if html is not None else "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def body(self):
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                raise ValueError("データが大きすぎます（1MBまで）")
            try:
                return json.loads(self.rfile.read(n) or b"{}")
            except ValueError:
                raise ValueError("JSONの形式が正しくありません")

        def route(self, method):
            url = urlparse(self.path)
            parts = [p for p in url.path.split("/") if p]
            try:
                if method == "GET" and not parts:
                    return self.send(200, html=STATUS_PAGE)
                if method == "GET" and parts == ["v1", "state"]:
                    return self.send(200, market.state())
                if method == "POST" and parts == ["v1", "records"]:
                    return self.send(200, {"record_id": market.add_record(self.body())})
                if method == "GET" and parts == ["v1", "lots"]:
                    return self.send(200, {"lots": market.open_lots()})
                if method == "POST" and len(parts) == 4 and parts[:2] == ["v1", "lots"] and parts[3] == "bids":
                    return self.send(200, market.place_bid(parts[2], self.body()))
                if method == "GET" and parts == ["v1", "results"]:
                    with market.lock:
                        return self.send(200, {"results": market.results[:20]})
                if method == "GET" and len(parts) == 3 and parts[:2] == ["v1", "deliveries"]:
                    buyer = parse_qs(url.query).get("buyer", [""])[0]
                    return self.send(200, {"records": market.delivery(parts[2], buyer)})
                if method == "GET" and len(parts) == 3 and parts[:2] == ["v1", "sellers"]:
                    with market.lock:
                        return self.send(200, {"earned_usd": market.earned.get(parts[2], 0)})
                return self.send(404, {"error": "not found"})
            except PermissionError as e:
                return self.send(403, {"error": str(e)})
            except ValueError as e:
                return self.send(400, {"error": str(e)})

        def do_GET(self):
            self.route("GET")

        def do_POST(self):
            self.route("POST")

    return Handler


def main():
    ap = argparse.ArgumentParser(description="AgentData Protocol server")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--round", type=float, default=300, help="1ラウンドの秒数（本番想定は300=5分）")
    args = ap.parse_args()

    market = Market(args.round)
    threading.Thread(target=market.clock, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(market))
    print(color(f"ADP server: http://127.0.0.1:{args.port}  (1ラウンド {args.round:g} 秒 · Ctrl+C で停止)", "1"))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()

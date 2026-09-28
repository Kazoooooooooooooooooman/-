"""買い手の例（AIなし）: 決まったルールで入札するだけのエージェント。

APIキーなしで動くので、まずこれで仕組みを確認できます。
例:  python buyer_simple.py Rule-Bot-A ja_qa.v1=18 controller.v2=12
"""

import sys
import time

import adp

name = sys.argv[1] if len(sys.argv) > 1 else "Rule-Bot-A"
prices = dict(a.split("=") for a in sys.argv[2:]) or {"ja_qa.v1": "15", "controller.v2": "12"}

b = adp.buyer(name)
done = set()
while True:
    for lot in b.lots():
        if lot["id"] in done or lot["schema"] not in prices:
            continue
        amount = max(float(prices[lot["schema"]]), lot["reserve_usd"])
        b.bid(lot["id"], amount)
        done.add(lot["id"])
        print(f"{name}: {lot['id']} ({lot['schema']}) に ${amount:.2f} で入札")
    time.sleep(2)

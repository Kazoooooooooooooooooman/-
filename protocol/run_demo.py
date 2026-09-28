"""全部まとめて起動するデモ: サーバー + 売り手2人 + 買い手エージェント。

  python run_demo.py

- 1ラウンドは20秒（本番の5分を短縮）
- ANTHROPIC_API_KEY が設定されていれば、Claudeで判断するあなたのエージェントも参加
- ブラウザで http://127.0.0.1:8787 を開くと様子が見えます
- Ctrl+C で全部止まります
"""

import importlib.util
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).parent
PY = sys.executable

procs = [
    ("server ", ["adp_server.py", "--round", "20"]),
    ("seller1", ["seller_japanese_qa.py"]),
    ("seller2", ["seller_gamer.py"]),
    ("buyerA ", ["buyer_simple.py", "Rule-Bot-A", "ja_qa.v1=14", "controller.v2=19"]),
    ("buyerB ", ["buyer_simple.py", "Rule-Bot-B", "ja_qa.v1=22", "controller.v2=11"]),
]
if os.environ.get("ANTHROPIC_API_KEY") and importlib.util.find_spec("anthropic"):
    procs.append(("claude ", ["buyer_claude.py"]))
else:
    print("※ ANTHROPIC_API_KEY が未設定（または anthropic 未インストール）なので、Claudeエージェントなしで動かします。\n")


def pipe(label, proc):
    for line in proc.stdout:
        print(f"[{label}] {line}", end="", flush=True)


running = []
env = dict(os.environ, PYTHONUNBUFFERED="1", PYTHONIOENCODING="utf-8")
try:
    for i, (label, args) in enumerate(procs):
        p = subprocess.Popen([PY, *args], cwd=HERE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", env=env)
        running.append(p)
        threading.Thread(target=pipe, args=(label, p), daemon=True).start()
        time.sleep(1.5 if i == 0 else 0.3)  # let the server come up first
    print("起動しました → http://127.0.0.1:8787  （Ctrl+C で停止）\n")
    while all(p.poll() is None for p in running):
        time.sleep(0.5)
except KeyboardInterrupt:
    pass
finally:
    for p in running:
        p.terminate()
    print("\n停止しました")

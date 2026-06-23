#!/usr/bin/env python3
"""
sql.py — quality.db に SQL を投げて結果を表で表示するヘルパー(sqlite3 CLI 不要)

使い方:
  python3 sql.py "SELECT * FROM annotators LIMIT 5;"     # 直接クエリ
  python3 sql.py path/to/query.sql                        # .sql ファイルを実行
  python3 sql.py                                          # 対話モード (空行2回 or 'exit' で終了)

ヒント:
  - 複数文を ; 区切りで書くと、最後の SELECT 結果だけ表示します。
  - .schema 相当が見たいときは: python3 sql.py "SELECT sql FROM sqlite_master WHERE type='table';"
"""
import sqlite3, sys, os

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "quality.db")


def render(cur):
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description] if cur.description else []
    if not cols:
        print("(no result set)")
        return
    widths = [len(c) for c in cols]
    srows = []
    for r in rows:
        sr = ["" if v is None else str(v) for v in r]
        srows.append(sr)
        for i, v in enumerate(sr):
            widths[i] = max(widths[i], len(v))
    line = "+".join("-" * (w + 2) for w in widths)
    def fmt(vals):
        return "| " + " | ".join(v.ljust(widths[i]) for i, v in enumerate(vals)) + " |"
    print(line.join(["+", "+"]))
    print(fmt(cols))
    print(line.join(["+", "+"]))
    for sr in srows:
        print(fmt(sr))
    print(line.join(["+", "+"]))
    print(f"{len(rows)} row(s)")


def run(query):
    if not os.path.exists(DB):
        sys.exit("quality.db がありません。先に `python3 generate_data.py` を実行してください。")
    con = sqlite3.connect(DB)
    try:
        render(con.execute(query))
    except sqlite3.Error as e:
        print("SQL ERROR:", e)
    finally:
        con.close()


def _split_statements(text):
    """コメント行を除き、; で文を分割する(文字列内 ; は本教材では使わない前提)。"""
    lines = []
    for ln in text.splitlines():
        s = ln.strip()
        if s.startswith("--") or s == "":
            continue
        lines.append(ln)
    blob = "\n".join(lines)
    return [s.strip() for s in blob.split(";") if s.strip()]


def run_file(path):
    """解答ファイル(.sql)を、文ごとに「クエリ → 結果」で表示する。"""
    if not os.path.exists(DB):
        sys.exit("quality.db がありません。先に `python3 generate_data.py` を実行してください。")
    with open(path) as f:
        text = f.read()
    con = sqlite3.connect(DB)
    for i, stmt in enumerate(_split_statements(text), 1):
        print(f"\n===== Q{i} " + "=" * 50)
        print(stmt + ";")
        print("-" * 60)
        try:
            render(con.execute(stmt))
        except sqlite3.Error as e:
            print("SQL ERROR:", e)
    con.close()


def repl():
    print("対話モード。SQL を入力し、空行で実行。'exit' で終了。")
    buf = []
    while True:
        try:
            line = input("sql> " if not buf else "...> ")
        except EOFError:
            break
        if line.strip().lower() in ("exit", "quit", "\\q"):
            break
        if line.strip() == "" and buf:
            run("\n".join(buf)); buf = []
            continue
        buf.append(line)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        repl()
    else:
        arg = " ".join(sys.argv[1:])
        if arg.endswith(".sql") and os.path.exists(arg):
            run_file(arg)
        else:
            run(arg)

# サイトマップの URL を IndexNow（Bing・Yandex・Naver など）にまとめて知らせる。
# 記事を出したり直したりしたあとに実行する：python3 sumi-phone/tools/indexnow.py
import json, re, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEY = "9533acaf0bf1ebb524dcf93d0bc6fcd5"
HOST = "sotophone.jp"
urls = re.findall(r"<loc>([^<]+)</loc>", (ROOT / "sitemap.xml").read_text())
body = json.dumps({"host": HOST, "key": KEY, "keyLocation": f"https://{HOST}/{KEY}.txt", "urlList": urls}).encode()
req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body, headers={"Content-Type": "application/json; charset=utf-8"})
with urllib.request.urlopen(req, timeout=30) as res:
    print(res.status, f"{len(urls)} 件の URL を知らせました")

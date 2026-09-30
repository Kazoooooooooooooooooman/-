"""Build a static, click-through demo of the Seri web app (no server needed).

    cd seri/demo && python build_demo.py <out_dir>

It seeds a throwaway database with the sample data, records the real API responses for each demo
person, and writes the web pages with an API stand-in (mock.js) that answers from that snapshot.
Saving, recording and downloads are disabled in the demo.
"""

import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEB = HERE.parent / "web"
BACKEND = HERE.parent / "backend"

tmp = tempfile.mkdtemp(prefix="seri-demo-")
os.environ["SERI_DATABASE_URL"] = f"sqlite:///{tmp}/demo.db"
os.environ["SERI_STORAGE_DIR"] = f"{tmp}/uploads"
sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient  # noqa: E402

import seed_demo  # noqa: E402
from app import models  # noqa: E402
from app.config import CATEGORIES, INDUSTRIES  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402

H = {"X-Seri-CSRF": "1"}
PERSONAS = {"hanako": "hanako@seri.example.com", "taro": "taro@seri.example.com", "buyer": "buyer@seri.example.com",
            "reviewer": "reviewer@seri.example.com", "admin": "admin@seri.example.com"}
PAGES = ["index.html", "standard.html", "terms.html", "privacy.html", "tokushoho.html",
         "app/creator.html", "app/assets.html", "app/buyer.html", "app/catalog.html", "app/review.html",
         "app/admin.html", "app/account.html"]
SCRIPTS = ["landing.js", "creator.js", "assets.js", "buyer.js", "catalog.js", "review.js", "admin.js", "account.js", "wav.js"]


def login(email):
    c = TestClient(app, base_url="http://testserver")
    assert c.post("/api/auth/login", json={"email": email, "password": seed_demo.PASSWORD}, headers=H).status_code == 200
    return c


def capture() -> dict:
    sys.argv = ["seed_demo.py", "--sample"]
    seed_demo.main()
    # a few recordings waiting for review, so the reviewer has something to grade
    taro = login(PERSONAS["taro"])
    task = taro.get("/api/tasks").json()[0]
    for f in (170, 190):
        r = taro.post(f"/api/tasks/{task['id']}/submissions",
                      files={"file": ("a.wav", seed_demo.tone(seconds=7, freq=f), "audio/wav")}, headers=H)
        assert r.status_code == 201, r.text

    public = TestClient(app, base_url="http://testserver")
    snap = {"public": {p: public.get(p).json() for p in ("/api/meta", "/api/public/stats")}, "personas": {}}
    common = ["/api/me", "/api/account/consents"]
    for name, email in PERSONAS.items():
        c = login(email)
        role = c.get("/api/me").json()["role"]
        paths = list(common)
        if role == "creator":
            paths += ["/api/creator/dashboard", "/api/tasks", "/api/submissions/mine", "/api/creator/assets", "/api/earnings"]
        if role == "buyer":
            paths += ["/api/orders/mine"]
        if role in ("reviewer", "admin"):
            paths += ["/api/review/queue"]
        if role == "admin":
            paths += ["/api/admin/kpis", "/api/admin/orders", "/api/admin/disputes", "/api/admin/waitlist", "/api/admin/audit",
                      "/api/admin/ledger/check", "/api/admin/users?role=creator", "/api/admin/users?role=buyer"]
        s = {p: c.get(p).json() for p in paths}
        if role == "buyer":
            for o in s["/api/orders/mine"]:
                if o["delivered"]:
                    s[f"/api/orders/{o['id']}/datacard"] = c.get(f"/api/orders/{o['id']}/datacard").json()
            s["catalog"] = {cat: c.get(f"/api/catalog?category={cat}&limit=500").json() for cat in CATEGORIES}
        if role == "admin":
            s["leaderboard"] = {f"{cat}|{ind}": c.get(f"/api/admin/leaderboard?category={cat}&industry={ind}").json()
                                for cat in CATEGORIES for ind in INDUSTRIES}
        snap["personas"][name] = s
    # media and downloads point at one demo recording
    text = json.dumps(snap, ensure_ascii=False)
    text = re.sub(r'"/api/(?:admin/)?assets/\d+/(?:audio|download)"', '"demo.wav"', text)
    return json.loads(text)


def rewrite(text: str) -> str:
    """Absolute site paths -> flat relative files; login and routing -> the persona hub."""
    text = re.sub(r"/app/login\.html[^\"'`\s)]*", "hub.html", text)
    text = text.replace('"/app/"', '"hub.html"')
    text = re.sub(r"/app/(\w+\.html)", r"\1", text)
    text = text.replace("/assets/", "./")
    text = re.sub(r'(["\'])/(\w+\.(?:html|svg))', r"\1\2", text)
    # the Artifact serves the demo hub as index.html, so the landing page is top.html
    text = text.replace('href="/"', 'href="top.html"').replace('href: "/"', 'href: "top.html"').replace('location.href = "/"', 'location.href = "hub.html"')
    text = re.sub(r"`/api/review/\$\{s\.id\}/audio`", '"demo.wav"', text)
    text = text.replace('$("#detail-json").href = `/api/orders/${o.id}/datacard`;', '$("#detail-json").hidden = true;')
    return text


def demo_api_js() -> str:
    src = (WEB / "assets" / "api.js").read_text()
    src = src.replace("export async function api(", "async function realApi(")
    src = src.replace("export async function requireUser(", "async function realRequireUser(")
    return rewrite('import { mockApi, personaFor, setPersona } from "./mock.js";\n' + src) + '''
// ---------- demo mode ----------
let pageRoles;
export async function api(path, opts) { return mockApi(path, opts, pageRoles); }
export async function requireUser(roles) {
  pageRoles = roles;
  setPersona(personaFor(roles));
  const me = await api("/api/me");
  if ($("#shell")) shell(me);
  return me;
}
const banner = el("div", { class: "banner demo-banner" },
  el("b", {}, "デモ版: 見本データを表示しています"),
  el("span", {}, "保存・録音・ダウンロードは本番でのみ動きます。"),
  el("a", { href: "hub.html" }, "見る立場を切り替える"));
document.querySelector(".wrap")?.prepend(banner);
'''


def page_fragment(full_html: str) -> str:
    """The Artifact's main page is wrapped in its own document skeleton: keep only title, links and body content."""
    head = re.search(r"<head>(.*?)</head>", full_html, re.S).group(1)
    keep = "\n".join(line for line in head.splitlines() if line.startswith(("<title", "<link")))
    body = re.search(r"<body>(.*?)</body>", full_html, re.S).group(1)
    return keep + "\n" + body


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else HERE / "dist")
    snap = capture()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for page in PAGES:
        name = "top.html" if page == "index.html" else Path(page).name
        (out / name).write_text(rewrite((WEB / page).read_text()))
    for script in SCRIPTS:
        (out / script).write_text(rewrite((WEB / "assets" / script).read_text()))
    (out / "api.js").write_text(demo_api_js())
    (out / "app.css").write_text((WEB / "assets" / "app.css").read_text() + '''
/* demo */
.demo-banner { flex-direction: row; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; }
.persona { text-decoration: none; color: var(--ink); gap: 6px; }
.persona:hover { border-color: var(--ink); }
.persona b { font-size: 18px; }
''')
    shutil.copy(WEB / "favicon.svg", out / "favicon.svg")
    shutil.copy(HERE / "mock.js", out / "mock.js")
    shutil.copy(HERE / "hub.js", out / "hub.js")
    (out / "snapshot.js").write_text("export const SNAP = " + json.dumps(snap, ensure_ascii=False) + ";\n")
    db = SessionLocal()
    wav_key = db.query(models.Submission).first().file_key
    db.close()
    shutil.copy(Path(os.environ["SERI_STORAGE_DIR"]) / wav_key, out / "demo.wav")

    head = ('<!doctype html>\n<html lang="ja"><head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Seri デモ</title>\n'
            '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans+JP:wght@400;600&display=swap">\n'
            '<link rel="stylesheet" href="app.css">\n</head><body>\n')
    hub = (HERE / "hub.html").read_text() + '<script type="module" src="hub.js"></script>\n'
    full = head + hub + "</body></html>\n"
    (out / "hub.html").write_text(full)
    (out / "main.html").write_text(page_fragment(full))
    print(f"demo written to {out}")


if __name__ == "__main__":
    main()

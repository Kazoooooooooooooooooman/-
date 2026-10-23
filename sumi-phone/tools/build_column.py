"""コラムを作る：column-src/*.html（先頭に <!--meta {...} --> を書いた本文）から、
column/<slug>.html（記事）、column/index.html（一覧）、sitemap.xml（サイトの地図）を作り直す。

使い方：python3 tools/build_column.py   （sumi-phone の中で動かす）

本文の書き方：
  <!--meta {"slug": "screen-time", "title": "検索結果に出るタイトル", "h1": "ページの見出し（省略可）",
             "description": "検索結果の説明文（120字くらい）", "published": "2026-10-15", "updated": "2026-10-15",
             "related": ["ほかの記事の slug"], "sources": [["出典名", "URL"], ...]} -->
  <p class="lead">最初のまとめ</p>
  <h2>見出し</h2> ...   ← h2 から目次を自動で作る
"""
import html, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / "column-src", ROOT / "column"
SITE = "https://sotophone.jp"
AUTHOR = "佐々木 一真"
CSS_VER = re.search(r'styles\.css\?v=([0-9a-z]+)', (ROOT / "index.html").read_text()).group(1)

# ヘッダーのロゴは、ほかのページと同じものを使う
TERMS = (ROOT / "terms.html").read_text()
LOGO = re.search(r'<svg class="logo-mark".*?</svg>', TERMS, re.S).group(0)

def esc(s): return html.escape(s, quote=True)

def head(title, desc, url, extra_ld):
    return f'''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}" />
<link rel="canonical" href="{url}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Soto Phone" />
<meta property="og:url" content="{url}" />
<meta property="og:title" content="{esc(title)}" />
<meta property="og:description" content="{esc(desc)}" />
<meta property="og:image" content="{SITE}/images/og-ja.jpg" />
<meta property="og:locale" content="ja_JP" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="/favicon.ico" sizes="48x48" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon-192.png" type="image/png" sizes="192x192" />
<link rel="apple-touch-icon" href="/images/apple-touch-icon.png" />
<link rel="stylesheet" href="/fonts/fonts.css" />
<link rel="stylesheet" href="/styles.css?v={CSS_VER}" />
<script type="application/ld+json">{json.dumps(extra_ld, ensure_ascii=False)}</script>
</head>
<body class="legal-page column-page">
<a class="skip" href="#main">本文へ移動</a>
<header class="nav is-scrolled">
  <a class="logo" href="/" aria-label="Soto Phone トップへ">
    {LOGO}<span class="logo-word">SOTO</span>
  </a>
  <nav class="nav-links" id="site-menu" aria-label="メインメニュー">
    <div class="nav-main">
      <a href="/#phone">製品</a>
      <a href="/plans">プラン</a>
      <a href="/column/" aria-current="page">コラム</a>
    </div>
    <div class="nav-util">
      <a href="/contact">お問い合わせ</a>
      <span class="nav-lang"><a href="/" hreflang="ja" lang="ja" aria-current="true">JA</a><span aria-hidden="true">/</span><a href="/en" hreflang="en" lang="en">EN</a></span>
    </div>
  </nav>
  <a class="nav-cta" href="/?from=column#signup">最初に見る</a>
  <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-menu" aria-label="メニュー" data-close="メニューを閉じる"><span></span><span></span></button>
</header>
'''

FOOT = '''<footer class="footer">
  <div class="wrap">
    <p class="footer-links footer-site"><a href="/#phone">製品</a><a href="/plans">プラン</a><a href="/shop">ショップ</a><a href="/referral">紹介</a><a href="/#signup">私たちについて</a><a href="/column/">コラム</a><a href="/login">ログイン</a></p>
    <p class="footer-links"><a href="/column/">コラム</a><a href="/privacy">プライバシーポリシー</a><a href="/terms">利用規約・返金</a><a href="/privacy#cookies">Cookie</a><a href="/contact">お問い合わせ</a></p>
    <p class="small">運営：Soto Phone（代表 佐々木 一真）／ <a href="/">sotophone.jp</a></p>
  </div>
</footer>
<script src="/nav.js?v=''' + CSS_VER + '''" defer></script>
</body>
</html>
'''

def jdate(d):
    y, m, dd = d.split("-")
    return f"{int(y)}年{int(m)}月{int(dd)}日"

def slugify_id(text, i):
    return f"s{i}"

def load():
    arts = []
    for p in sorted(SRC.glob("*.html")):
        raw = p.read_text()
        m = re.match(r'\s*<!--meta\s+(\{.*?\})\s*-->\s*', raw, re.S)
        if not m:
            raise SystemExit(f"{p.name}: 先頭に <!--meta {{...}} --> がありません")
        meta = json.loads(m.group(1))
        meta["body"] = raw[m.end():]
        # "draft": true の記事は、出典を元の資料で確かめ終わるまで公開しない（ページも一覧もサイトマップも作らない）
        if meta.get("draft"):
            (OUT / f"{meta['slug']}.html").unlink(missing_ok=True)
            continue
        arts.append(meta)
    arts.sort(key=lambda a: a["published"], reverse=True)
    return arts

# ---------- グラフ ----------
# 本文に <figure class="chart" data-chart='{...}'></figure> と書くと、ここでグラフに置き換える。
#   {"type": "hbar"（横棒）か "col"（縦棒）, "title": "グラフの見出し", "unit": "分",
#    "rows": [["10代", 243.4], ...], "highlight": ["20代"], "max": 300（省略可）, "source": "出典の短い名前"}
# HTML と CSS で組むので、スマホでも文字が本文と同じ大きさで読める。
# 色は2つだけ：ふつうの棒は墨の灰色、話の中心の棒（highlight）は朱。値は棒の端に書き、表の代わりにもなる。
# ラベルの改行は "\n" で入れる
def fmt(v):
    return (f"{v:,.1f}" if v % 1 else f"{int(v):,}")

def chart_html(c):
    rows, unit, hl = c["rows"], c.get("unit", ""), set(c.get("highlight", []))
    vmax = c.get("max") or max(v for _, v in rows) * (1.0 if c["type"] == "hbar" else 1.08)
    title = esc(c["title"])
    items = []
    for k, v in rows:
        pct = max(v / vmax * 100, 1)
        cls = " is-hl" if k in hl else ""
        label = '<span class="ch-sep">・</span><br />'.join(esc(x) for x in k.split("\n"))
        tip = esc(k.replace("\n", " ")) + "：" + fmt(v) + esc(unit)
        items.append(f'<li class="ch-row{cls}" title="{tip}"><span class="ch-label">{label}</span>'
                     f'<span class="ch-track"><span class="ch-bar" style="--v:{pct:.1f}%"></span><span class="ch-value">{fmt(v)}<small>{esc(unit)}</small></span></span></li>')
    src = f'<span class="ch-src">出典：{esc(c["source"])}</span>' if c.get("source") else ""
    kind = "ch-h" if c["type"] == "hbar" else "ch-c"
    # ラベルが長い横棒は、スマホでラベルを棒の上に置く（横に並べると折り返しで崩れるため）
    if c["type"] == "hbar" and max(max(len(x) for x in k.split("\n")) for k, _ in rows) > 5:
        kind += " ch-stack"
    return f'<figure class="chart {kind}"><figcaption class="ch-title">{title}</figcaption><ul class="ch-rows" role="list">{"".join(items)}</ul>{src}</figure>'

def render_charts(body):
    def rep(m):
        return chart_html(json.loads(html.unescape(m.group(1))))
    return re.sub(r"<figure class=\"chart\" data-chart='(.*?)'></figure>", rep, body, flags=re.S)

def place_toc(body, toc):
    """目次の位置：本文に <!--toc--> があればそこ、なければ最初のまとめ（lead）のすぐ下"""
    if "<!--toc-->" in body:
        return body.replace("<!--toc-->", toc, 1)
    if body.lstrip().startswith('<p class="lead"'):
        head, rest = body.split("</p>", 1)
        return head + "</p>\n" + toc + rest
    return toc + body

def build_article(a, by_slug):
    url = f"{SITE}/column/{a['slug']}"
    body = render_charts(a["body"])
    # h2 に id を付けて、目次を作る
    toc = []
    def add_id(m):
        attrs, text = m.group(1), m.group(2)
        hid = re.search(r'id="([^"]+)"', attrs)
        hid = hid.group(1) if hid else f"s{len(toc) + 1}"
        toc.append((hid, re.sub(r"<[^>]+>", "", text)))
        attrs = re.sub(r'\s*id="[^"]+"', "", attrs)
        return f'<h2 id="{hid}"{attrs}>{text}</h2>'
    body = re.sub(r"<h2([^>]*)>(.*?)</h2>", add_id, body, flags=re.S)
    toc_html = "".join(f'<li><a href="#{i}">{esc(t)}</a></li>' for i, t in toc)
    sources = a.get("sources", [])
    src_html = ""
    if sources:
        src_html = '<section class="article-sources" aria-labelledby="src-h"><h2 id="src-h">出典</h2><ol>' + "".join(
            f'<li>{esc(n)}<br /><a href="{esc(u)}" rel="noopener" target="_blank">{esc(u)}</a></li>' for n, u in sources) + "</ol></section>"
    rel = [by_slug[s] for s in a.get("related", []) if s in by_slug]
    rel_html = ""
    if rel:
        rel_html = '<section class="article-related" aria-labelledby="rel-h"><h2 id="rel-h">あわせて読みたい</h2><ul>' + "".join(
            f'<li><a href="/column/{r["slug"]}">{esc(r.get("h1") or r["title"])}</a></li>' for r in rel) + "</ul></section>"
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "Article", "headline": a.get("h1") or a["title"], "description": a["description"],
         "datePublished": a["published"], "dateModified": a.get("updated", a["published"]),
         "author": {"@type": "Person", "name": AUTHOR, "jobTitle": "Soto Phone 代表", "url": SITE + "/"},
         "publisher": {"@type": "Organization", "name": "Soto Phone", "url": SITE + "/", "logo": {"@type": "ImageObject", "url": SITE + "/favicon-512.png"}},
         "mainEntityOfPage": url, "image": SITE + "/images/og-ja.jpg", "inLanguage": "ja"},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Soto Phone", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": "コラム", "item": SITE + "/column/"},
            {"@type": "ListItem", "position": 3, "name": a.get("h1") or a["title"], "item": url}]}]}
    upd = a.get("updated", a["published"])
    dates = f'<time datetime="{a["published"]}">{jdate(a["published"])}</time>' + (f'（更新：<time datetime="{upd}">{jdate(upd)}</time>）' if upd != a["published"] else "")
    cta_from = "col-" + a["slug"]
    page = head(a["title"], a["description"], url, ld) + f'''<main id="main" class="legal article">
  <div class="wrap">
    <nav class="crumbs" aria-label="現在の場所"><a href="/">Soto Phone</a><span aria-hidden="true">›</span><a href="/column/">コラム</a></nav>
    <article>
      <h1>{esc(a.get("h1") or a["title"])}</h1>
      <p class="article-meta">{dates}・書いた人：{AUTHOR}（Soto Phone 代表）</p>
      {place_toc(body, f'<nav class="article-toc" aria-labelledby="toc-h"><p id="toc-h">この記事の内容</p><ol>{toc_html}</ol></nav>')}
      {src_html}
    </article>
    <aside class="article-cta" aria-label="Soto Phone について">
      <p class="article-cta-eyebrow" lang="en">Soto Phone</p>
      <p class="article-cta-h">SNS もゲームもない携帯電話を、作っています。</p>
      <p>集中したいときは通知が止まり、外で過ごすほど携帯代が安くなる。発売が決まったら、先行予約に登録した方に最初にお知らせします。</p>
      <a class="btn btn-cta" href="/?from={cta_from}#signup"><span class="btn-dot" aria-hidden="true"></span><span class="btn-label">先行予約に登録する（無料）</span></a>
    </aside>
    {rel_html}
  </div>
</main>
''' + FOOT
    (OUT / f"{a['slug']}.html").write_text(page)

def build_index(arts):
    url = f"{SITE}/column/"
    ld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": "コラム｜Soto Phone", "url": url, "inLanguage": "ja"}
    items = "" if arts else '<li class="col-item"><p class="col-desc" style="padding:24px 4px">最初の記事を準備しています。</p></li>'
    items += "".join(f'''<li class="col-item"><a href="/column/{a["slug"]}"><p class="col-date"><time datetime="{a["published"]}">{jdate(a["published"])}</time></p><h2>{esc(a.get("h1") or a["title"])}</h2><p class="col-desc">{esc(a["description"])}</p></a></li>''' for a in arts)
    page = head("スマホとの付き合い方コラム｜デジタルデトックス・スマホ依存・ミニマルフォン｜Soto Phone", "スマホ依存のセルフチェック、スクリーンタイムが続かない理由、デジタルデトックスのやり方、日本で使えるミニマルフォンまで。データと出典つきで解説する、Soto Phone のコラムです。", url, ld) + f'''<main id="main" class="legal column-index">
  <div class="wrap">
    <h1>コラム</h1>
    <p class="column-lead">スマホとの付き合い方、集中のしかた、画面の外で過ごす時間について書いています。</p>
    <ul class="col-list">{items}</ul>
  </div>
</main>
''' + FOOT
    (OUT / "index.html").write_text(page)

def changed_on(name):
    """ページの中身を最後に変えた日。CSS・JS の版番号（?v=…）だけが変わった日は数えない（毎回すべてのページが「更新」に見えてしまうため）。
    まだコミットしていない変更があれば、今日の日付にする"""
    import datetime, subprocess
    norm = lambda t: re.sub(r"\?v=[0-9a-z]+", "", t)
    git = lambda *a: subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True).stdout
    rel = str((ROOT / name).relative_to(pathlib.Path(git("rev-parse", "--show-toplevel").strip())))
    now = (ROOT / name).read_text()
    head = git("show", f"HEAD:{rel}")
    if head and norm(head) != norm(now):
        return datetime.date.today().isoformat()
    for line in git("log", "--format=%H %cs", "--", rel).splitlines():
        sha, day = line.split()
        before = git("show", f"{sha}^:{rel}")
        if norm(before) != norm(git("show", f"{sha}:{rel}")):
            return day
    return datetime.date.today().isoformat()

def build_sitemap(arts):
    pages = [("/", "index.html", True), ("/en", "en.html", True), ("/column/", "column/index.html", False),
             ("/contact", "contact.html", False), ("/contact-en", "contact-en.html", False),
             ("/shop", "shop.html", False), ("/shop-en", "shop-en.html", False), ("/plans", "plans.html", False), ("/plans-en", "plans-en.html", False), ("/referral", "referral.html", False), ("/referral-en", "referral-en.html", False),
             ("/privacy", "privacy.html", False), ("/privacy-en", "privacy-en.html", False),
             ("/terms", "terms.html", False), ("/terms-en", "terms-en.html", False)]
    base = [(p, changed_on(f), a) for p, f, a in pages]
    alt = '\n    <xhtml:link rel="alternate" hreflang="ja" href="https://sotophone.jp/" /><xhtml:link rel="alternate" hreflang="en" href="https://sotophone.jp/en" />'
    rows = [f'  <url><loc>{SITE}{p}</loc><lastmod>{d}</lastmod>{alt if a else ""}</url>' for p, d, a in base]
    rows += [f'  <url><loc>{SITE}/column/{a["slug"]}</loc><lastmod>{a.get("updated", a["published"])}</lastmod></url>' for a in arts]
    (ROOT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + "\n".join(rows) + "\n</urlset>\n")

if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    arts = load()
    by = {a["slug"]: a for a in arts}
    for a in arts:
        build_article(a, by)
    build_index(arts)
    build_sitemap(arts)
    print(f"{len(arts)} 本の記事を作りました")

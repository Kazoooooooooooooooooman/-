# -*- coding: utf-8 -*-
"""バイブコーディング実践教科書: HTMLフラグメントを連結し PDF を生成する。"""
import os, glob
from weasyprint import HTML

HERE = os.path.dirname(os.path.abspath(__file__))
FRAG = os.path.join(HERE, "chapters")

head = ('<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">'
        '<link rel="stylesheet" href="style.css"></head><body>')
tail = "</body></html>"

frags = sorted(glob.glob(os.path.join(FRAG, "*.html")))
body = "\n".join(open(f, encoding="utf-8").read() for f in frags)
full = head + body + tail

out_html = os.path.join(HERE, "_render.html")
open(out_html, "w", encoding="utf-8").write(full)

pdf_path = os.path.join(HERE, "バイブコーディング自己修正の教科書.pdf")
HTML(filename=out_html, base_url=HERE).write_pdf(pdf_path)
print("OK ->", pdf_path)
print("fragments:", len(frags))

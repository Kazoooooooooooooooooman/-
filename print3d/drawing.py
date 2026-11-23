# 寸法入り図面（SVG→HTML）。数値は soto_case.py と同じ
W,H,R,WALL,SKIN=71.4,71.0,10.0,1.2,1.0
SCR,SCR_R,GLASS=61.6,3.0,64.0
S=4.2  # px/mm
def rr(x,y,w,h,r,cls='o'): return f'<rect x="{x*S}" y="{y*S}" width="{w*S}" height="{h*S}" rx="{r*S}" class="{cls}"/>'
def circ(x,y,d,cls='o'): return f'<circle cx="{x*S}" cy="{y*S}" r="{d/2*S}" class="{cls}"/>'
def dim(x1,y1,x2,y2,txt,off=0,vert=False):
    # 寸法線（矢印付き）と数値
    if vert:
        X=x1+off; s=f'<line x1="{x1*S}" y1="{y1*S}" x2="{X*S}" y2="{y1*S}" class="e"/><line x1="{x2*S}" y1="{y2*S}" x2="{X*S}" y2="{y2*S}" class="e"/>'
        s+=f'<line x1="{X*S}" y1="{y1*S}" x2="{X*S}" y2="{y2*S}" class="d" marker-start="url(#a)" marker-end="url(#a)"/>'
        s+=f'<text x="{X*S+6}" y="{(y1+y2)/2*S+4}" class="t">{txt}</text>'; return s
    Y=y1+off; s=f'<line x1="{x1*S}" y1="{y1*S}" x2="{x1*S}" y2="{Y*S}" class="e"/><line x1="{x2*S}" y1="{y2*S}" x2="{x2*S}" y2="{Y*S}" class="e"/>'
    s+=f'<line x1="{x1*S}" y1="{Y*S}" x2="{x2*S}" y2="{Y*S}" class="d" marker-start="url(#a)" marker-end="url(#a)"/>'
    s+=f'<text x="{(x1+x2)/2*S}" y="{Y*S-5}" class="t" text-anchor="middle">{txt}</text>'; return s
def label(x,y,t,anchor='start'): return f'<text x="{x*S}" y="{y*S}" class="t" text-anchor="{anchor}">{t}</text>'

def view(title, body, w=W+30, h=H+28):
    return f'<div class="v"><h3>{title}</h3><svg width="{w*S}" height="{h*S}"><g transform="translate({14*S},{12*S})">{body}</g></svg></div>'

# 正面
f = rr(0,0,W,H,R) + rr((W-SCR)/2,(H-SCR)/2,SCR,SCR,SCR_R,'w') + rr((W-GLASS)/2,(H-GLASS)/2,GLASS,GLASS,SCR_R+1,'h')
f += dim(0,H,W,H,f'{W}',off=7) + dim(W,0,W,H,f'{H}',off=7,vert=True)
f += dim((W-SCR)/2,0,(W+SCR)/2,0,f'画面窓 {SCR}',off=-5) + label(W/2,H/2,f'画面の窓 {SCR}×{SCR}（3.4インチ）','middle')
f += label(W/2,H/2+5,f'裏に {GLASS}×{GLASS} 深さ0.8 の段（ガラス用）','middle') + label(2,H-3,f'角R{R:.0f}')
# 背面（背中側から見た図）
b = rr(0,0,W,H,R) + circ(13,13,13.2) + circ(24,11,3.2)
for sx in (2.7, W-2.7):
    for sy in (H/2-11.5, H/2+11.5): b += circ(sx,sy,2.2)
b += dim(0,0,13,0,'13',off=-5) + dim(0,0,0,13,'13',off=-6,vert=True) + label(W/2,H/2-2,'カメラ穴 φ13.2（中心：左端から13・上から13）','middle') + label(W/2,H/2+3,'ライト穴 φ3.2（中心：左端から24・上から11）','middle')
b += label(W/2,H/2+8,'M2ネジ穴 φ2.2 ×4（左右の端から2.7・中心から上下11.5）','middle') + label(W-2,H-3,'背面側から見た図','end')
# 右側面
T1,T2=7.7,10.0
sd = rr(0,0,T2,H,1.5) + rr(T2+16,0,T1,H,1.5)
for x0,T in ((0,T2),(T2+16,T1)):
    sd += rr(x0+T/2-1,14,2,12,1,'w') + rr(x0+T/2-1,31.5,2,9,1,'w')
sd += label(T2/2,-3,'10mm版','middle') + label(T2+16+T1/2,-3,'7.7mm版','middle')
sd += dim(T2+16+T1,0,T2+16+T1,14,'14',off=6,vert=True) + dim(T2+16+T1,14,T2+16+T1,26,'12',off=12,vert=True)
sd += dim(T2+16+T1,31.5,T2+16+T1,40.5,'9',off=12,vert=True) + label(T2+16+T1+3,H-4,'下の穴：上端から31.5')
sd += label(0,H+6,'ボタン穴 高さ2（厚みの中央）')
# 下面
bt = rr(0,0,W,T2,1.5) + rr(W/2-4.7,T2/2-1.7,9.4,3.4,1.4,'w') + rr(0,T2+10,W,T1,1.5) + rr(W/2-4.7,T2+10+T1/2-1.7,9.4,3.4,1.4,'w')
bt += label(W+2,T2/2+1,'10mm版') + label(W+2,T2+10+T1/2+1,'7.7mm版') + label(W/2,T2+10+T1+7,'USB-C穴 9.4×3.4（中央）','middle')
bt += dim(0,T2,W,T2,'71.4',off=-T2-3)

html = f'''<!doctype html><html><head><meta charset="utf-8"><style>
@page{{size:A3 landscape;margin:10mm}} body{{font-family:"Noto Sans CJK JP",sans-serif;margin:0;padding:16px;color:#111;background:#fff}}
h1{{font-size:20px;margin:0 0 4px}} p{{margin:0 0 10px;font-size:12px;color:#444}} .g{{display:flex;flex-wrap:wrap;gap:8px}} h3{{font-size:14px;margin:4px 0}}
.o{{fill:none;stroke:#111;stroke-width:1.6}} .w{{fill:#f1f1ee;stroke:#111;stroke-width:1.2}} .h{{fill:none;stroke:#999;stroke-width:1;stroke-dasharray:4 3}}
.e{{stroke:#888;stroke-width:.6}} .d{{stroke:#1a57c9;stroke-width:1}} .t{{font-size:11px;fill:#1a1a1a}}
</style></head><body><h1>Soto Phone 試作ケース 寸法図（単位：mm）</h1>
<p>前面フレーム＋背面カバーの2分割。STL は mm 単位。外形 71.4 × 71.0、厚み 7.7（デザイン通り）／10.0（部品を入れやすい版）。側壁1.2・前後の板1.0。</p>
<div class="g">{view("正面（画面側）",f)}{view("背面（背中側から）",b)}{view("右側面（ボタン側）",sd,w=70,h=H+30)}{view("下面（USB-C）",bt,w=W+40,h=40)}</div>
<p>中の空間：7.7mm版 約69×68.6×5.7／10mm版 約69×68.6×8.0（ネジ柱を除く）。はめ込みの隙間0.15、M2ネジ4本で背面から固定。</p>
</body></html>'''
open('drawing.html','w').write(html)

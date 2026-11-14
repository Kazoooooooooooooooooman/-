# 1枚目の松の丘：日本画の黒松とすやり霞。index.html / en.html の hd-grove をつくる
import math, random, re
INK='#3a3833'
L=f'fill="none" stroke="{INK}" stroke-linecap="round" stroke-linejoin="round"'
def trunk_shape(rng, lean, H):
    # 幹の中心線（根元 0,0 → 上）を、くねらせながら細くしていく
    n=7; pts=[]
    for i in range(n+1):
        t=i/n
        x=lean*(26*math.sin(t*2.6+0.4)-14*t)+rng.uniform(-2,2)
        pts.append((x,-H*t))
    left=[]; right=[]
    for i,(x,y) in enumerate(pts):
        w=(11*(1-i/n)+2.2)/2
        if i<n:
            dx=pts[i+1][0]-x; dy=pts[i+1][1]-y
        else:
            dx=x-pts[i-1][0]; dy=y-pts[i-1][1]
        l=math.hypot(dx,dy) or 1; nx,ny=-dy/l, dx/l
        left.append((x+nx*w,y+ny*w)); right.append((x-nx*w,y-ny*w))
    poly=left+right[::-1]
    d='M'+' L'.join(f'{x:.1f} {y:.1f}' for x,y in poly)+' Z'
    return d, pts
def pad(rng, cx, cy, w, h):
    # 平らな底に、ゆるいこぶが並ぶ雲形の葉
    bumps=rng.choice([3,4,4,5])
    x0=cx-w/2; step=w/bumps
    d=f'M{x0:.1f} {cy:.1f} '
    tops=[]
    for i in range(bumps):
        xa=x0+step*i; xb=xa+step; hh=h*(0.75+0.45*math.sin(math.pi*(i+.5)/bumps))*(1+rng.uniform(-.15,.15))
        d+=f'C{xa:.1f} {cy-hh:.1f} {xb:.1f} {cy-hh:.1f} {xb:.1f} {cy:.1f} '
        tops.append(((xa+xb)/2, cy-hh*0.75))
    d+=f'Q{cx:.1f} {cy+h*.28:.1f} {x0:.1f} {cy:.1f} Z'
    return d, tops
def pine(seed, lean, H=128):
    rng=random.Random(seed)
    tdraw, pts=trunk_shape(rng, lean, H)
    out=f'<path d="{tdraw}" fill="#4b4136" fill-opacity=".85"/>'
    # 枝と、段に重なる葉
    tiers=[(.30,-1,80,17),(.30,1,52,14),(.52,1,74,16),(.52,-1,40,12),(.72,-1,62,15),(.88,1,46,13),(1.0,0,30,10)]
    br=''; pads=''
    for f,side,w,h in tiers:
        i=min(len(pts)-1,round(f*(len(pts)-1))); tx,ty=pts[i]
        px=tx+side*w*0.32+rng.uniform(-4,4); py=ty-2
        if side: br+=f'M{tx:.1f} {ty+4:.1f} Q{(tx+px)/2:.1f} {ty-2:.1f} {px:.1f} {py+3:.1f} '
        d,tops=pad(rng,px,py,w,h)
        pads+=f'<path d="{d}" fill="#3f5c45" fill-opacity=".93"/>'
        d2,_=pad(rng,px-w*.04,py-h*.12,w*.7,h*.55)
        pads+=f'<path d="{d2}" fill="#6f8c66" fill-opacity=".55"/>'
        pads+=f'<path d="{d}" {L} stroke-opacity=".5" stroke-width="1.2"/>'
        pads+=''.join(f'<path d="M{x-4:.1f} {y+2:.1f} l3 -5 M{x+3:.1f} {y+2:.1f} l2 -5" {L} stroke-opacity=".35" stroke-width="1"/>' for x,y in tops)
    if br: out+=f'<path d="{br}" {L} stroke-opacity=".65" stroke-width="2.2"/>'
    return out+pads
def build():
    ground=160
    # 位置（0..1600）、地面からの上げ、大きさ、傾き、遠さ
    spots=[(30,0,1.1,1,0),(150,8,.58,-1,1),(250,2,.92,-1,0),(370,10,.5,1,1),(470,5,.72,1,0),
           (610,12,.44,-1,1),(740,14,.38,1,1),(860,14,.36,-1,1),(990,12,.42,1,1),
           (1120,5,.75,-1,0),(1230,10,.5,1,1),(1350,2,.95,1,0),(1460,8,.6,-1,1),(1575,0,1.1,-1,0)]
    trees=''
    for i,(x,dy,s,lean,far) in enumerate(spots):
        op='.42' if far else '1'
        dur=8+(i%5)*0.9; dl=-(i*1.1)%7
        trees+=f'<g class="pn{" far" if far else ""}" transform="translate({x} {ground-dy}) scale({s})" opacity="{op}"><g class="pn-sway" style="animation-duration:{dur:.1f}s;animation-delay:{dl:.1f}s">{pine(300+i,lean)}</g></g>'
    # すやり霞：角の丸い、横に長い帯
    def band(x,y,w,h,cls):
        return f'<g class="kasumi {cls}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h/2}" fill="#efe6cf" fill-opacity=".86"/><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h/2}" fill="none" stroke="#c8b98f" stroke-opacity=".7" stroke-width="1.2" vector-effect="non-scaling-stroke"/></g>'
    mist_back=band(330,92,520,22,'k1')+band(980,70,460,20,'k2')
    mist_front=band(-60,128,420,24,'k3')+band(1240,122,430,24,'k4')+band(700,138,360,18,'k5')
    ridge='M-40 162 C200 150 380 156 560 151 S860 145 1020 150 S1330 157 1640 160'
    return f'''<div class="hd-grove" aria-hidden="true">
        <svg viewBox="0 0 1600 170" preserveAspectRatio="xMidYMax slice">
          <path d="{ridge} L1640 175 L-40 175 Z" fill="#d6dccb" fill-opacity=".6"/>
          {mist_back}
          {trees}
          {mist_front}
          <path d="{ridge}" {L} stroke-opacity=".42" stroke-width="1.4" vector-effect="non-scaling-stroke"/>
        </svg>
      </div>'''
if __name__=='__main__':
    grove=build()
    for f in ['index.html','en.html']:
        s=open(f).read()
        s,n=re.subn(r'<svg class="hd-road".*?</svg><span class="hd-stations".*?</span></span>','',s,flags=re.S); assert n==1,(f,'road')
        m=re.search(r'(<h1 class="hd-copy">.*?</h1>)',s); assert m
        s=s.replace(m.group(1), m.group(1)+'\n      '+grove,1)
        open(f,'w').write(s)
    c=open('styles.css').read()
    a=c.index('/* 道：SOTO を一本の細い線がまたぐ'); b=c.index('.hd-phone {')
    c=c[:a]+'''/* 松の丘：キャッチコピーと SOTO のあいだ。日本画の黒松が並び、すやり霞がゆっくり流れる。どちらの文字にもかからない */
.hd-grove { width: 100vw; margin: clamp(12px, 3vh, 30px) calc(50% - 50vw) 0; height: clamp(80px, 15vh, 170px); pointer-events: none; }
.hd-grove svg { display: block; width: 100%; height: 100%; overflow: visible; }
.pn-sway { transform-box: fill-box; transform-origin: 50% 100%; animation: pn-sway 9s ease-in-out infinite alternate; }
.pn.far .pn-sway { animation-name: pn-sway-far; }
@keyframes pn-sway { from { transform: rotate(-1.1deg); } to { transform: rotate(1.1deg); } }
@keyframes pn-sway-far { from { transform: rotate(-.5deg); } to { transform: rotate(.5deg); } }
.kasumi { animation: kasumi 26s ease-in-out infinite alternate; }
.k2, .k4 { animation-duration: 32s; animation-direction: alternate-reverse; }
.k5 { animation-duration: 22s; }
@keyframes kasumi { from { transform: translateX(-28px); } to { transform: translateX(28px); } }
'''+c[b:]
    c=re.sub(r'\n  \.stn b \{[^\n]*\n  \.stn em \{[^\n]*\n  \.stn i \{[^\n]*\n  \.stn-ic \{[^\n]*\n  \.stn-l, \.stn-r \{[^\n]*\n  \.stn-l i, \.stn-r i \{[^\n]*','',c)
    c=c.replace('  .rd-dot { display: none; }','  .pn-sway, .kasumi { animation: none; }')
    open('styles.css','w').write(c)
    print('ok')

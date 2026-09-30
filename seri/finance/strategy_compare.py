import math, random, statistics as st
random.seed(21)
VAR_NEW, VAR_RES = 13.3/300, 1.8/300
def margins(take, warranty=0.0, early=0.0):
    return take - VAR_NEW - warranty + early, take - VAR_RES - warranty + early
STAGES=[1.2e6,3e6,6e6,12e6]
RULE=[.5,12,0]
def sim(take, warranty=0, early=0, gmv0=0.5e6, subs=False, policy="staged", n=20000, months=36, g1=.20, g2=.08):
    m_new, m_res = margins(take, warranty, early)
    fails=0; fp=[]; cash_end=[]
    for _ in range(n):
        cash=6e6; gmv=gmv0; si=0; hist=[]; first=None; dead=False
        for t in range(1,months+1):
            if t==4: cash+=75e6
            mu=g1 if t<=12 else g2 if t<=24 else .04
            gmv*=math.exp(random.gauss(math.log(1+mu),.25))
            if random.random()<.03: gmv*=.6
            r=min(.45,.45*t/30); gp=gmv*(m_new*(1-r)+m_res*r)
            if subs and t>=6: gp+=min(12,(t-6)//3+1)*1e5      # enterprise plans: +1 every 3 months, ¥10万/month platform fee each
            hist.append(gp)
            if policy=="fixed": F=1.2e6 if t<5 else 6e6
            else:
                tr=sum(hist[-3:])/min(3,len(hist))
                if si+1<len(STAGES) and t>=4 and tr>=RULE[0]*STAGES[si+1] and cash>=RULE[1]*max(0,STAGES[si+1]-tr) and cash>=RULE[2]*STAGES[si+1]: si+=1
                if si>0 and tr<.25*STAGES[si] and cash<9*(STAGES[si]-tr): si-=1
                F=STAGES[si]
            cash+=gp-F
            if first is None and gp>F: first=t
            if cash<0: fails+=1; dead=True; break
        if not dead:
            cash_end.append(cash)
            if first: fp.append(first)
    return fails/n, (st.median(fp) if fp else None), (st.median(cash_end)/1e6 if cash_end else None)


for rule in ([.5,12,0],[.7,18,6]):
    RULE[:]=rule
    print("rule",rule)
    for name,kw in [("  今のモデル", dict(take=.20)),("  提案", dict(take=.25, warranty=.01, early=.0075, gmv0=2e6, subs=True)),("  提案・成長半分", dict(take=.25, warranty=.01, early=.0075, gmv0=2e6, subs=True, g1=.10, g2=.05))]:
        p,fm,c=sim(**kw); print(f"{name}: 倒産 {p:.1%} | 黒字化 {fm}ヶ月目 | 36ヶ月後の自由資金 {c:.0f}百万円")

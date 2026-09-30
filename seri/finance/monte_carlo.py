import math, random, statistics as st, json
random.seed(11)
P=300.0
def margins(take):
    return take-(6+5+1.5+0.8)/P, take-(1.5+0.3)/P
STAGES=[1.2e6,3e6,6e6,12e6]
def sim(policy, take=0.20, gmv0=0.5e6, g1=0.20, g2=0.08, g3=0.04, sd=0.25, raise_=75e6, raise_m=4, months=36, n=20000, keep=False):
    m_new,m_res=margins(take)
    fails=0; profit_m=[]; paths=[]; endF=[]
    for k in range(n):
        cash=6e6; gmv=gmv0; si=0; gp_hist=[]; path=[]; first_profit=None; dead=False
        for t in range(1,months+1):
            if t==raise_m: cash+=raise_
            mu=g1 if t<=12 else g2 if t<=24 else g3
            gmv*=math.exp(random.gauss(math.log(1+mu),sd))
            if random.random()<0.03: gmv*=0.6
            r=min(0.45,0.45*t/30); m=m_new*(1-r)+m_res*r
            gp=gmv*m; gp_hist.append(gp)
            if policy=="fixed":
                F=1.2e6 if t<5 else 6e6
            else:  # staged: step up only when trailing-3m gross profit covers half of the next stage and cash covers 12 months of the gap
                tr=sum(gp_hist[-3:])/min(3,len(gp_hist))
                if si+1<len(STAGES) and t>=raise_m and tr>=0.5*STAGES[si+1] and cash>=12*max(0,STAGES[si+1]-tr): si+=1
                if si>0 and tr<0.25*STAGES[si] and cash<9*(STAGES[si]-tr): si-=1   # step down if the gap can't be funded
                F=STAGES[si]
            cash+=gp-F
            path.append(cash)
            if first_profit is None and gp>F: first_profit=t
            if cash<0: fails+=1; dead=True; break
        if not dead:
            endF.append(F)
            if first_profit: profit_m.append(first_profit)
        if keep: paths.append(path+[path[-1]]*(months-len(path)))
    out={"P_bankrupt":round(fails/n,3),"median_first_profit_month":st.median(profit_m) if profit_m else None,
         "share_ending_at_12M_burn":round(sum(1 for f in endF if f>=12e6)/n,2)}
    if keep:
        pct=lambda p:[sorted(col)[int(p*(len(col)-1))] for col in zip(*paths)]
        out["p10"],out["p50"],out["p90"]=pct(.1),pct(.5),pct(.9)
    return out

res={}
for name,kw in {
 "fixed_20":dict(policy="fixed"),
 "staged_20":dict(policy="staged"),
 "staged_20_slow":dict(policy="staged",g1=0.10,g2=0.05),
 "staged_20_noraise":dict(policy="staged",raise_=0),
 "fixed_25":dict(policy="fixed",take=0.25),
 "staged_20_gmv2M":dict(policy="staged",gmv0=2e6),
}.items():
    r=sim(**kw); res[name]=r; print(name,r)
# paths for chart
f=sim("fixed",n=4000,keep=True); s=sim("staged",n=4000,keep=True)
json.dump({"fixed_p50":f["p50"],"staged_p50":s["p50"],"staged_p10":s["p10"],"fixed_p10":f["p10"]},open("paths.json","w"))
print("fixed p50 path (M):",[round(x/1e6,1) for x in f["p50"][::3]])
print("staged p50 path (M):",[round(x/1e6,1) for x in s["p50"][::3]])
print("staged p10 path (M):",[round(x/1e6,1) for x in s["p10"][::3]])

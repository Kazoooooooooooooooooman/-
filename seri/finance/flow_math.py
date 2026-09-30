import math, datetime as dt
def binom_cdf(c,n,p): return sum(math.comb(n,k)*p**k*(1-p)**(n-k) for k in range(c+1))
# acceptance sampling: consumer risk <=5% at 5% defects, producer risk <=5% at 1% defects
best=None
for n in range(10,400):
    for c in range(0,15):
        if binom_cdf(c,n,.05)<=.05 and 1-binom_cdf(c,n,.01)<=.05:
            best=(n,c); break
    if best: break
n,c=best
print("sampling plan n,c:",best, "P(accept|5%)",round(binom_cdf(c,n,.05),3),"P(reject|1%)",round(1-binom_cdf(c,n,.01),3), "P(accept|2%)",round(binom_cdf(c,n,.02),3))
for N in (100,500,2000,10000):
    print(f"lot {N}: sample {min(n,N)} = {min(n,N)/N:.1%} (vs flat 5% = {math.ceil(N*.05)})")

# payout lag: current (14-day acceptance, month-end close, pay on 10th) vs proposed (sampling acceptance ~2 days, weekly close Sun, pay Fri)
start=dt.date(2026,1,1); cur=[]; new=[]
for d in range(365):
    day=start+dt.timedelta(d)
    acc=day+dt.timedelta(14)
    nm=(acc.replace(day=28)+dt.timedelta(days=4)).replace(day=1)   # first day of next month
    cur.append((nm.replace(day=10)-day).days)
    acc2=day+dt.timedelta(2)
    sunday=acc2+dt.timedelta((6-acc2.weekday())%7)
    new.append((sunday+dt.timedelta(5)-day).days)
print("current lag avg/max:",round(sum(cur)/len(cur),1),max(cur)," proposed avg/max:",round(sum(new)/len(new),1),max(new))

# valuation: gamma-poisson
a,b=1.2,2.0   # prior: 0.6 sales/month per lot
for k,t in ((0,1),(4,3),(10,6)):
    lam=(a+k)/(b+t); print(f"sales {k} in {t}m -> {lam:.2f}/month -> 12m value at ¥3,600/sale x90%: ¥{12*lam*3600*.9:,.0f}")
# exclusivity premium example: item base ¥300/min, 1 min, grade A 1.5, scarcity 1.3
base=300*1*1.5*1.3; lam_item=0.6; cat=250
term=6*lam_item*cat*1.2; buy=sum(lam_item*cat*0.97**m for m in range(24))*1.2
print(f"item price standard ¥{base:.0f}  term-exclusive ¥{base+term:.0f} (x{(base+term)/base:.2f})  buyout ¥{base+buy:.0f} (x{(base+buy)/base:.2f})")
# self-submission threshold: accept category if 12*lambda*price*take > QA cost
for lam in (0.01,0.02,0.05,0.1):
    print("lambda",lam,"expected Seri gross per item",round(12*lam*250*0.2,1),"vs QA 13.3")

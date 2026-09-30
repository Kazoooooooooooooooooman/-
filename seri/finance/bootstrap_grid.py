import math,random
random.seed(3)
m_new=0.20-(13.3/300); m_res=0.20-(1.8/300)
def p_bankrupt(F,gmv0,cash0=6e6,g1=.2,n=20000):
    fails=0
    for _ in range(n):
        c=cash0; g=gmv0
        for t in range(1,37):
            g*=math.exp(random.gauss(math.log(1+(g1 if t<=12 else .08 if t<=24 else .04)),.25))
            if random.random()<.03: g*=.6
            r=min(.45,.45*t/30); c+=g*(m_new*(1-r)+m_res*r)-F
            if c<0: fails+=1; break
    return fails/n
for F in (0.3e6,0.5e6,0.8e6,1.2e6):
    print(f"固定費¥{F/1e4:.0f}万", *(f"開始GMV¥{g/1e4:.0f}万:{p_bankrupt(F,g):.0%}" for g in (0.5e6,1e6,2e6,3e6)))

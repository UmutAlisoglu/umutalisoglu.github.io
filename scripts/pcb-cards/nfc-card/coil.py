import math
MU=4e-7*math.pi
def seg_self(l,w,t=35e-6):
    # Greenhouse self inductance of rectangular bar
    return 2e-7*l*(math.log(2*l/(w+t))+0.50049+(w+t)/(3*l))
def mutual_parallel(l,d):
    q=math.log(l/d+math.sqrt(1+(l/d)**2))-math.sqrt(1+(d/l)**2)+d/l
    return 2e-7*l*q
def mutual_offset(l1,l2,p,q_,d):
    # parallel segments, general Grover: segments along x, seg1 [0,l1], seg2 [a,a+l2]
    pass
def segs_spiral(W,H,n,w,s):
    # rectangular spiral, returns list of (x1,y1,x2,y2) centerlines
    pitch=w+s; out=[]
    x0,y0,x1,y1=w/2,w/2,W-w/2,H-w/2
    for i in range(n):
        o=i*pitch
        a,b,c,d=x0+o,y0+o,x1-o,y1-o
        out+=[(a,b,c,b),(c,b,c,d),(c,d,a+ (pitch if True else 0),d),(a+pitch,d,a+pitch,b+pitch) if False else (a,d,a,b+pitch)]
    return out
def M(sa,sb):
    # mutual between two straight segments, parallel only (Neumann numeric otherwise 0 for perpendicular)
    ax=(sa[2]-sa[0],sa[3]-sa[1]); bx=(sb[2]-sb[0],sb[3]-sb[1])
    if abs(ax[0]*bx[1]-ax[1]*bx[0])>1e-12: return 0.0
    # numeric Neumann integral
    N=60;tot=0
    la=math.hypot(*ax); lb=math.hypot(*bx)
    dot=(ax[0]*bx[0]+ax[1]*bx[1])/(la*lb)
    for i in range(N):
        pa=(sa[0]+ax[0]*(i+.5)/N, sa[1]+ax[1]*(i+.5)/N)
        for j in range(N):
            pb=(sb[0]+bx[0]*(j+.5)/N, sb[1]+bx[1]*(j+.5)/N)
            r=math.hypot(pa[0]-pb[0],pa[1]-pb[1])
            tot+= (la/N)*(lb/N)/r
    return 1e-7*tot*dot
def L(W,H,n,w,s):
    S=[tuple(v*1e-3 for v in sg) for sg in segs_spiral(W,H,n,w,s)]
    tot=sum(seg_self(math.hypot(a[2]-a[0],a[3]-a[1]),w*1e-3) for a in S)
    for i in range(len(S)):
        for j in range(len(S)):
            if i!=j: tot+=M(S[i],S[j])
    return tot
import sys
for W,H in [(36,42),(36,40),(34,38)]:
  for n in [3,4,5,6]:
    for w,s in [(0.5,0.4),(0.6,0.4)]:
        l=L(W,H,n,w,s); f=1/(2*math.pi*math.sqrt(l*50e-12))
        print(W,H,n,w,s, round(l*1e6,3),'uH', round(f/1e6,2),'MHz@50pF', round(1/(2*math.pi*math.sqrt(l*28.5e-12))/1e6,2),'@28.5')

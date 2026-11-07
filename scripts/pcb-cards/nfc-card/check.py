import pickle, sys
from pcblib import *
d=pickle.load(open(sys.argv[1],'rb'))
B=d['board']
res={}
for sname in ('top','bot'):
    L=d[sname]
    for lay,(mw,ms) in {'cu':(0.15,0.15),'silk':(0.15,0.15),'mask':(0.1,0.1)}.items():
        g=L[lay]
        if lay=='mask':
            # mask dam = gap between openings must be >=0.1 ; opening width irrelevant
            t=[]; n=significant(narrow_gaps(g,0.1),0.002)
        else:
            t=significant(thin_parts(g,mw),0.003); n=significant(narrow_gaps(g,ms),0.003)
        res[f'{sname}.{lay}']=(len(t),len(n))
        for p in (t+n)[:4]:
            c=p.centroid; print(f'  {sname}.{lay} issue at {c.x:.2f},{c.y:.2f} area {p.area:.4f}')
    # edge clearance
    e=L['cu'].difference(B.buffer(-0.3)).area
    print(sname,'copper within 0.3mm of edge:',round(e,4))
    # silk on openings
    print(sname,'silk over mask openings:',round(L['silk'].intersection(L['mask']).area,4))
print(res)

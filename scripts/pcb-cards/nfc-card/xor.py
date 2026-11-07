import pickle, cv2, numpy as np
from PIL import Image, ImageDraw
from pcblib import polys
d=pickle.load(open('out/layers.pkl','rb'))
m={'GTL':('top','cu'),'GBL':('bot','cu'),'GTO':('top','silk'),'GBO':('bot','silk'),'GTS':('top','mask'),'GBS':('bot','mask')}
for ext,(s,l) in m.items():
    g=d[s][l]; im=cv2.imread(f'out/alisoglu-nfc-card.{ext}.png',0)>0
    h,w=im.shape; x0,y0,x1,y1=g.bounds; sx=w/(x1-x0); sy=h/(y1-y0)
    ref=np.zeros((h,w),bool)
    for p in polys(g):
        m=Image.new('L',(w,h),0); dr=ImageDraw.Draw(m)
        dr.polygon([((x-x0)*sx,(y1-y)*sy) for x,y in p.exterior.coords],fill=255)
        for r in p.interiors: dr.polygon([((x-x0)*sx,(y1-y)*sy) for x,y in r.coords],fill=0)
        ref|=np.array(m)>0
    diff=ref^im
    # ignore 1px boundary differences
    er=cv2.erode(diff.astype(np.uint8),np.ones((3,3),np.uint8))
    print(ext,'pixels',ref.sum(),'differ beyond edge',int(er.sum()))

import sys, glob, numpy as np, cv2
from pygerber.gerberx3.api.v2 import GerberFile, ImageFormatEnum, PixelFormatEnum
out=sys.argv[1]
for f in sorted(glob.glob(out+'/*.G*')):
    try:
        p=GerberFile.from_file(f).parse()
        p.render_raster(f+'.png', dpmm=20, image_format=ImageFormatEnum.PNG, pixel_format=PixelFormatEnum.RGB)
        im=cv2.imread(f+'.png',0); print(f.split('/')[-1],'ok',im.shape, 'filled %.1f%%'%(100*(im>128).mean()))
    except Exception as e:
        print(f, 'ERR', repr(e)[:300])
# QR decode from preview (crop back side)
im=cv2.imread(out+'/prev-blue.png')
det=cv2.QRCodeDetector()
val,pts,_=det.detectAndDecode(im)
print('QR from preview:', repr(val))

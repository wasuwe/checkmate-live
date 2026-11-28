# คราบเทาอมฟ้าที่อยู่ลึกในตัวหมาก (ช่องระหว่างขากับไม้) -> ทาสีขอบครีม: python coolfill.py <prefix> <kinds> [x0,y0,x1,y1]
import sys, os
import numpy as np
from PIL import Image, ImageFilter
prefix, kinds = sys.argv[1], sys.argv[2]
box = [int(v) for v in sys.argv[3].split(',')] if len(sys.argv) > 3 else None
def dil(m, r): return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * r + 1))) > 127
for k in kinds:
    path = os.path.join('work', f'{prefix}-{k}.png')
    a = np.asarray(Image.open(path).convert('RGBA')).copy()
    r, g, b = [a[..., i].astype(int) for i in range(3)]
    al = a[..., 3] > 0; s = r + g + b
    cool = al & (r - b < 22) & (s < 680) & (s > 60)
    m = cool | (al & (r - b < 34) & (s < 700) & dil(cool, 2))
    if box:
        z = np.zeros(m.shape, bool); z[box[1]:box[3], box[0]:box[2]] = True; m &= z
    a[m, :3] = (253, 241, 216)
    Image.fromarray(a, 'RGBA').save(path)
    ys, xs = np.where(m)
    print(k, 'painted', int(m.sum()), 'bbox', (xs.min(), ys.min(), xs.max(), ys.max()) if len(xs) else None)

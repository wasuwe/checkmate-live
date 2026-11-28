# ลบพื้นที่รูปหลายเหลี่ยมให้โปร่งใส: python polyclear.py <work png> "x,y x,y x,y ..." ["..."]
import sys
import numpy as np
from PIL import Image, ImageDraw
path = sys.argv[1]
im = Image.open(path).convert('RGBA')
m = Image.new('L', im.size, 0)
d = ImageDraw.Draw(m)
for poly in sys.argv[2:]:
    d.polygon([tuple(float(v) for v in p.split(',')) for p in poly.split()], fill=255)
a = np.asarray(im).copy()
k = np.asarray(m) > 0
print('cleared', int((k & (a[..., 3] > 0)).sum()))
a[k, 3] = 0
Image.fromarray(a, 'RGBA').save(path)

# เก็บคราบเทาอมฟ้าตามขอบ (เศษพื้นหลังสีเข้มที่กลืนกับขอบครีม) สำหรับตัวละครที่มีแต่สีโทนอุ่น
# พิกเซลโทนเย็นหรือเทาใกล้ขอบนอก -> โปร่งใส, ที่อยู่ลึกกว่านั้น -> สีขอบครีม
# ใช้: python coolhalo.py <prefix> [kinds=KQRBNP] [depth=9]
import sys, os
import numpy as np
from PIL import Image, ImageFilter
prefix = sys.argv[1]; kinds = sys.argv[2] if len(sys.argv) > 2 else 'KQRBNP'; depth = int(sys.argv[3]) if len(sys.argv) > 3 else 9
def dil(m, r): return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * r + 1))) > 127
for k in kinds:
    path = os.path.join('work', f'{prefix}-{k}.png')
    a = np.asarray(Image.open(path).convert('RGBA')).copy()
    r, g, b = [a[..., i].astype(int) for i in range(3)]
    al = a[..., 3] > 0
    s = r + g + b
    cool = al & (r - b < 22) & (s < 680) & (s > 60)
    near = cool & dil(~al, depth)
    # ขยายไปยังพิกเซลกึ่งเทาที่ติดกัน
    soft = al & (r - b < 34) & (s < 700) & dil(near, 2)
    kill = near | soft
    a[kill, 3] = 0
    Image.fromarray(a, 'RGBA').save(path)
    print(k, 'cool', int(cool.sum()), 'cleared', int(kill.sum()))

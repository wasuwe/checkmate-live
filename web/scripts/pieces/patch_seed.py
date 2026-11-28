# แก้จุดเล็กด้วยมือ: ไหลจากจุดเริ่มผ่านพิกเซลที่สีใกล้กับสีของจุดเริ่ม (ภายในรัศมี) แล้วแทนที่ทั้งบริเวณ
# ใช้: PIECE_DIR=work PIECE_EXT=.png python patch_seed.py <file> <รัศมี> <ระยะสี> <clear | cream | #rrggbb> <x,y> [...]
#   clear = ทำให้โปร่งใส, cream = สีขอบสติกเกอร์ของตัวนั้น, #rrggbb = สีที่กำหนด
import sys, os
from collections import deque
import numpy as np
from PIL import Image, ImageFilter
d = os.environ.get('PIECE_DIR', '.'); EXT = os.environ.get('PIECE_EXT', '.png')
name, radius, tol, to = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
seeds = [tuple(int(v) for v in s.split(',')) for s in sys.argv[5:]]
path = os.path.join(d, name + EXT)
a = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32)
h, w, _ = a.shape
rgb, al = a[..., :3], a[..., 3]
seen = np.zeros((h, w), bool)
for x, y in seeds:
    ref = np.median(rgb[max(0, y - 1):y + 2, max(0, x - 1):x + 2].reshape(-1, 3), axis=0)
    near = (np.sqrt(((rgb - ref) ** 2).sum(axis=2)) < tol) & (al > 200)
    if not near[y, x]:
        print('  seed colour unstable at', (x, y)); continue
    q = deque([(y, x)]); part = np.zeros((h, w), bool); part[y, x] = True
    while q:
        cy, cx = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not part[ny, nx] and (nx - x) ** 2 + (ny - y) ** 2 <= radius ** 2:
                part[ny, nx] = True; q.append((ny, nx))
    # ขอบนุ่มของบริเวณ: พิกเซลติดกันที่สียังเอียงไปทางสีของจุดเริ่ม
    soft = (np.asarray(Image.fromarray((part * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0) & ~part & (np.sqrt(((rgb - ref) ** 2).sum(axis=2)) < tol * 2.2) & (al > 200)
    seen |= part | soft
out = a.copy()
if to == 'clear':
    out[seen, 3] = 0
else:
    if to == 'cream':
        band = (al > 200) & ~(np.asarray(Image.fromarray(((al > 200) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(13))) > 127)
        light = band & (rgb[..., 0] > 225) & (rgb[..., 1] > 200) & (rgb[..., 2] > 140)
        col = np.median(rgb[light], axis=0) if light.sum() > 200 else np.array([250.0, 232.0, 200.0])
    else:
        col = np.array([int(to[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)
    out[seen, :3] = col
print(name, to, 'px', int(seen.sum()))
Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA').save(path, **({'format': 'WEBP', 'quality': 92, 'method': 6} if EXT == '.webp' else {'format': 'PNG'}))

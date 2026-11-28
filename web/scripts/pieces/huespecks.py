# เก็บเศษสีพื้นหลังชิ้นเล็กด้วยโทนสี แทนระยะสี: ใช้เมื่อพื้นของแผ่นเป็นสีที่ตัวละครไม่มี (เช่นพื้นเขียวเข้มกับราชสีห์แผงคอน้ำเงินตัวส้ม)
# ระยะสีอย่างเดียวพลาดได้: ขอบแผงคอน้ำเงินเข้มอยู่ใกล้เขียวเข้ม จึงถูกทาทับเป็นจุดขาว
# ใช้: python huespecks.py <prefix> <green|teal|navy> [ขนาดก้อนสูงสุด=150]
import sys, os
from collections import deque
import numpy as np
from PIL import Image, ImageFilter
prefix, hue = sys.argv[1], sys.argv[2]
cap = int(sys.argv[3]) if len(sys.argv) > 3 else 150
for k in 'KQRBNP':
    path = os.path.join('work', f'{prefix}-{k}.png')
    a = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    s = r + g + b
    if hue == 'green':
        near = (g > r + 10) & (g > b + 6) & (s < 230)
    elif hue == 'teal':
        near = (b > r + 20) & (g > r + 12) & (s < 260)
    else:
        near = (b > r + 20) & (b > g + 12) & (s < 230)
    near &= al > 200
    h, w = near.shape
    seen = np.zeros((h, w), bool); kill = np.zeros((h, w), bool); n = 0
    for sy, sx in zip(*np.where(near)):
        if seen[sy, sx]:
            continue
        q = deque([(sy, sx)]); seen[sy, sx] = True; pts = [(sy, sx)]
        while q:
            y, x = q.popleft()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx)); pts.append((ny, nx))
        if 3 <= len(pts) <= cap:
            n += 1
            for y, x in pts:
                kill[y, x] = True
    if n:
        band = (al > 200) & ~(np.asarray(Image.fromarray(((al > 200) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(13))) > 127)
        light = band & (r > 225) & (g > 200) & (b > 140)
        cream = np.median(a[light][:, :3], axis=0) if light.sum() > 200 else np.array([250.0, 232.0, 200.0])
        grow = (np.asarray(Image.fromarray((kill * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0) & (al > 200)
        # ทาทับเฉพาะพิกเซลที่ไม่ใช่เส้นเข้มหรือสีของตัวละคร (สว่างปานกลางขึ้นไป หรือเป็นโทนพื้นหลังเอง)
        ok = grow & (near | (s > 380))
        a[ok, :3] = cream
        Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA').save(path)
    print(k, 'specks', n, end='; ')
print()

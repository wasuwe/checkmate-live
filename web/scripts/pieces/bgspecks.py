# เก็บเศษสีพื้นหลังชิ้นเล็กที่ยังเหลือในตัวหมาก (ขีดสีเขียวเข้มข้างหางหมาป่า): พิกเซลที่สีตรงกับพื้นของแผ่นและรวมกันเป็นก้อนเล็ก ทาเป็นสีขอบ
# ใช้: python bgspecks.py <prefix> <ระยะสี> [ขนาดก้อนสูงสุด=200]   (ทำกับไฟล์ใน work แล้วต้องรัน finish.py ต่อ)
import sys, os, json
from collections import deque
import numpy as np
from PIL import Image, ImageFilter
prefix, tol = sys.argv[1], float(sys.argv[2])
cap = int(sys.argv[3]) if len(sys.argv) > 3 else 200
bg = np.array(json.load(open(os.path.join('work', prefix + '.json')))['bg'], dtype=np.float32)
for k in 'KQRBNP':
    path = os.path.join('work', f'{prefix}-{k}.png')
    a = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3]
    near = (np.sqrt(((rgb - bg) ** 2).sum(axis=2)) < tol) & (al > 200)
    h, w = near.shape
    lab = np.zeros((h, w), bool); kill = np.zeros((h, w), bool); n = 0
    for sy, sx in zip(*np.where(near)):
        if lab[sy, sx]:
            continue
        q = deque([(sy, sx)]); lab[sy, sx] = True; pts = [(sy, sx)]
        while q:
            y, x = q.popleft()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = True; q.append((ny, nx)); pts.append((ny, nx))
        if 6 <= len(pts) <= cap:
            n += 1
            for y, x in pts:
                kill[y, x] = True
    if n:
        band = (al > 200) & ~(np.asarray(Image.fromarray(((al > 200) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(13))) > 127)
        light = band & (rgb[..., 0] > 225) & (rgb[..., 1] > 200) & (rgb[..., 2] > 140)
        cream = np.median(rgb[light], axis=0) if light.sum() > 200 else np.array([250.0, 232.0, 200.0])
        # ทาทับกว้างออกไป 3 พิกเซลรอบเศษ ให้คลุมขอบนุ่มของมันทั้งหมด (เศษพวกนี้ลอยอยู่ในพื้นที่สีขอบ ห่างจากเส้นของตัวหมาก)
        grow = (np.asarray(Image.fromarray((kill * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))) > 0) & (al > 200)
        a[grow, :3] = cream
        Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA').save(path)
    print(k, 'specks', n)

# ตัดแผ่นตัวหมากรุ่นที่ 2 (ขั้นที่ 1 จาก 2): แยกหมาก 6 ตัวออกจากแผ่น เก็บเป็น PNG ขนาดเต็ม พื้นโปร่งใส ยังไม่ย่อ ยังไม่ทำขอบ
# แก้ปัญหาที่ผู้ตรวจพบในรุ่นแรก: เศษพื้นหลังสีเข้มเกาะขอบ ดาวประดับที่ติดมากับตัว และพื้นหลังที่ถูกขังอยู่ในช่องปิด (หูเหยือก ระหว่างขา)
# ใช้: python cut2.py <sheet.png> <work_dir> <prefix> <K,Q,R,B,N,P> [close=9] [holes=1]
#   close  ขนาดการปิดรูรั่วของขอบสติกเกอร์ (เลขคี่ 0 = ไม่ปิด)
#   holes  1 = เจาะพื้นหลังที่ถูกขังในช่องปิดให้โปร่งใส, 0 = ไม่เจาะ (ใช้เมื่อสีพื้นหลังเหมือนสีตัวละคร เช่นแผ่นราชสีห์)
import sys, os, json
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

sheet_path, work, prefix, order = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4].split(',')
CLOSE = int(sys.argv[5]) if len(sys.argv) > 5 else 9
HOLES = int(sys.argv[6]) if len(sys.argv) > 6 else 1
TOL, TOL_EDGE, TOL_HOLE = 52, (int(sys.argv[7]) if len(sys.argv) > 7 else 28), 16
MARGIN = 16

im = Image.open(sheet_path).convert('RGB')
rgb = np.asarray(im)
a = rgb.astype(np.int32)
h, w, _ = a.shape
bg = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)
dist = np.sqrt(((a - bg) ** 2).sum(axis=2))

def mask_img(m):
    return Image.fromarray((m * 255).astype(np.uint8))

def dilate(m, k):
    return np.asarray(mask_img(m).filter(ImageFilter.MaxFilter(k))) > 127

def erode(m, k):
    return np.asarray(mask_img(m).filter(ImageFilter.MinFilter(k))) > 127

def flood(passable, seeds):
    hh, ww = passable.shape
    seen = np.zeros((hh, ww), bool)
    q = deque()
    for y, x in seeds:
        if passable[y, x] and not seen[y, x]:
            seen[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < hh and 0 <= nx < ww and passable[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True; q.append((ny, nx))
    return seen

def components(m):
    hh, ww = m.shape
    lab = np.zeros((hh, ww), np.int32); out = []; n = 0; q = deque()
    for sy in range(hh):
        for sx in range(ww):
            if m[sy, sx] and lab[sy, sx] == 0:
                n += 1; lab[sy, sx] = n; q.append((sy, sx)); c = 0; x0 = x1 = sx; y0 = y1 = sy
                while q:
                    y, x = q.popleft(); c += 1
                    x0, x1, y0, y1 = min(x0, x), max(x1, x), min(y0, y), max(y1, y)
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < hh and 0 <= nx < ww and m[ny, nx] and lab[ny, nx] == 0:
                            lab[ny, nx] = n; q.append((ny, nx))
                out.append((c, n, x0, y0, x1, y1))
    return lab, out

def border_seeds(hh, ww):
    return [(y, x) for x in range(ww) for y in (0, hh - 1)] + [(y, x) for y in range(hh) for x in (0, ww - 1)]

# 1) หาก้อนของหมากแบบหยาบ: ลบพื้นด้วยการไหลสีจากขอบภาพ โดยปิดรูรั่วของขอบสติกเกอร์ไว้ก่อน
near = dist < TOL
if CLOSE:
    near = ~erode(dilate(~near, CLOSE), CLOSE)
outside = flood(near, border_seeds(h, w))
label, comps = components(~outside)
comps.sort(reverse=True)
pieces = comps[:len(order)]
pieces.sort(key=lambda c: (0 if (c[3] + c[5]) / 2 < h / 2 else 1, (c[2] + c[4]) / 2))
print('bg', bg.astype(int), 'kept', [c[0] for c in pieces], 'next', [c[0] for c in comps[len(order):len(order) + 3]])

os.makedirs(work, exist_ok=True)
meta = {}
for kind, (count, n, x0, y0, x1, y1) in zip(order, pieces):
    X0, Y0, X1, Y1 = max(0, x0 - MARGIN), max(0, y0 - MARGIN), min(w, x1 + 1 + MARGIN), min(h, y1 + 1 + MARGIN)
    M = (label == n)[Y0:Y1, X0:X1]
    d = dist[Y0:Y1, X0:X1]
    hh, ww = M.shape
    # 2) เก็บขอบให้ตรงสีพื้นจริง: ให้สีพื้นไหลเข้าไปในแถบขอบ 6 พิกเซลของตัวหมากได้ (เก็บเศษพื้นที่เกาะขอบ) แต่เข้าไม่ถึงแกนใน
    core = erode(M, 13)
    out2 = flood(~M | ((d < TOL_EDGE) & ~core), border_seeds(hh, ww))
    A = M & ~out2
    # 3) ตัดสะพานเส้นบาง (ดาวประดับ ขีดความเร็วที่ติดมากับตัว) แล้วทิ้งชิ้นเล็กที่หลุดออกมา
    opened = dilate(erode(A, 5), 5) & A
    lab2, comps2 = components(opened)
    comps2.sort(reverse=True)
    keep = np.zeros((hh, ww), bool)
    for c, m2, *_ in comps2:
        if c == comps2[0][0] or c >= 1500:
            keep |= lab2 == m2
    A = A & dilate(keep, 7)
    dropped = sum(1 for c, *_ in comps2 if c != comps2[0][0] and c < 1500)
    # 4) พื้นหลังที่ถูกขังในช่องปิด: ก้อนสีพื้น (ตรงสีมาก) ที่หนาพอและไม่ใหญ่เกิน เจาะให้โปร่งใส
    holes = 0
    if HOLES == 2:
        # โหมดเข้ม (ตัวละครไม่มีสีใกล้สีพื้นเลย เช่น หนูครีมบนพื้นน้ำเงิน): ทุกพิกเซลสีพื้นในตัวหมากคือเศษพื้นหลัง
        px = a[Y0:Y1, X0:X1]
        bluish_dark = (px[..., 2] > px[..., 0] + 12) & (px.sum(axis=2) < 210)
        cand = A & ((d < 40) | (bluish_dark if bg[2] > bg[0] + 20 else False))
        holes = int(cand.sum())
        A &= ~(dilate(cand, 3) & (d < 70))
    elif HOLES:
        strict = A & (d < TOL_HOLE)
        # ก้อนหนา: เจาะได้ทุกที่ในตัวหมาก (หูเหยือก ช่องระหว่างขา)
        big = dilate(erode(strict, 7), 7) & strict
        lab3, comps3 = components(big)
        for c, m3, *_ in comps3:
            if 80 <= c <= 6000:
                A &= ~dilate(lab3 == m3, 5) | (d >= TOL_EDGE)
                holes += 1
        # เศษบางหรือเล็ก (ขีดความเร็ว ร่องระหว่างเกลียวลม): เจาะเฉพาะในแถบ 14 พิกเซลจากขอบนอก ไม่แตะตาและเส้นในตัว
        rim = A & ~erode(A, 29)
        lab4, comps4 = components(strict & rim & A) if HOLES == 3 else (None, [])   # เปิดเฉพาะแผ่นที่เส้นขอบตัวละครไม่ใช่สีเดียวกับพื้น
        for c, m4, *_ in comps4:
            if 10 <= c <= 6000:
                A &= ~dilate(lab4 == m4, 5) | (d >= TOL_EDGE)
                holes += 1
    # 5) เศษขีดในขอบสติกเกอร์ (ขีดความเร็ว เศษดาว จุดลอย ที่ผู้ตรวจรอบสองพบ): "หมึก" คือทุกอย่างที่ไม่ใช่สีครีมของขอบ
    #    ก้อนหมึกเล็กที่อยู่ในแถบขอบและไม่ติดกับตัวหมากคือเศษ ทาทับด้วยสีขอบ แล้วหดขอบเดิมให้เหลือ 5 พิกเซลรอบหมึก
    #    ติ่งขอบที่เคยห่อเศษไว้จึงหายไปด้วย (finish.py ทำขอบใหม่ให้หนาเท่ากันอีกที)
    prgb = rgb[Y0:Y1, X0:X1].copy()
    pf = prgb.astype(np.float32)
    band = A & ~erode(A, 13)
    light = band & (pf[..., 0] > 225) & (pf[..., 1] > 200) & (pf[..., 2] > 140)
    cream = np.median(pf[light], axis=0) if light.sum() > 200 else np.array([250.0, 232.0, 200.0])
    dc = np.sqrt(((pf - cream) ** 2).sum(axis=2))
    ink = erode(A, 5) & (dc > 42)
    deep = erode(A, 21)
    lab5, comps5 = components(ink)
    biggest_ink = max((c for c, *_ in comps5), default=0)
    debris = np.zeros((hh, ww), bool)
    bits = 0
    for c, m5, *_ in comps5:
        if c < 350 and c != biggest_ink:
            sel = lab5 == m5
            if (sel & deep).sum() < 0.5 * c:
                debris |= sel; bits += 1
    kept_ink = ink & ~debris
    paint = dilate(debris, 7) & A & ~dilate(kept_ink, 3)
    prgb[paint] = cream.astype(np.uint8)
    # แกนของตัวหมาก = หมึกที่เก็บไว้ + เนื้อใน แต่ไม่นับก้อนเนื้อในที่ไม่มีหมึกเลย (ติ่งขอบสีครีมล้วนที่เคยห่อฟองหรือดาว)
    figure = kept_ink | deep
    lab6, comps6 = components(figure)
    for c, m6, *_ in comps6:
        sel = lab6 == m6
        if (sel & kept_ink).sum() < 0.05 * c:
            figure &= ~sel
    A = A & dilate(figure, 11)
    # ริมนอก 4 พิกเซลที่ไม่ใช่หมึก ทาเป็นสีขอบล้วน (ริมเดิมเปื้อนสีพื้นของแผ่น ทำให้เห็นเป็นเส้นเข้มจาง ๆ รอบขอบ)
    edge = A & ~erode(A, 9) & ~dilate(kept_ink, 3)
    prgb[edge] = cream.astype(np.uint8)
    out = np.dstack([prgb, (A * 255).astype(np.uint8)])
    Image.fromarray(out, 'RGBA').save(os.path.join(work, f'{prefix}-{kind}.png'))
    meta[kind] = {'box': [int(X0), int(Y0), int(X1), int(Y1)], 'px': int(A.sum()), 'dropped': dropped, 'holes': holes, 'debris': bits}
    print(kind, 'box', (X0, Y0, X1, Y1), 'px', int(A.sum()), 'dropped bits', dropped, 'holes', holes, 'debris', bits)
json.dump({'bg': [int(v) for v in bg], 'pieces': meta}, open(os.path.join(work, f'{prefix}.json'), 'w'))

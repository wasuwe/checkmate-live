# ตัดแผ่นตัวหมากรุ่นที่ 2 (ขั้นที่ 2 จาก 2): ทำขอบสติกเกอร์ใหม่ให้เรียบและหนาเท่ากันรอบตัว ย่อให้ทุกตัวในชุดใช้อัตราส่วนเดียวกัน บันทึกเป็น WebP
# ผู้ตรวจติว่าขอบครีมของ AI หนาไม่เท่ากัน ขาดเป็นช่วง และมีเศษสีพื้นเกาะ จึงหดขอบเดิมเข้า 2 พิกเซล (ทิ้งริมที่เปื้อนสีพื้น)
# แล้วรองแผ่นสีครีมที่ขยายออกจากตัวหมากเท่ากันทุกด้านไว้ข้างหลัง ขอบจึงเรียบ ช่องโหว่แคบ ๆ ถูกเติมด้วยสีขอบเหมือนสติกเกอร์จริง
# ใช้: python finish.py <work_dir> <out_dir> <prefix> [ชนิดหมากที่จะเขียน เช่น KQRBNP]
import sys, os
import numpy as np
from PIL import Image, ImageFilter

work, out_dir, prefix = sys.argv[1], sys.argv[2], sys.argv[3]
write = sys.argv[4] if len(sys.argv) > 4 else 'KQRBNP'
SIZE = 512
RIM_IN, RIM_OUT = 3, 6      # หดขอบเดิมเข้า / ขยายแผ่นรองออก (พิกเซลที่ขนาดแผ่นต้นฉบับ)

def load(k):
    return Image.open(os.path.join(work, f'{prefix}-{k}.png')).convert('RGBA')

def bbox(im):
    return im.getchannel('A').getbbox()

kinds = [k for k in 'KQRBNP' if os.path.exists(os.path.join(work, f'{prefix}-{k}.png'))]
boxes = {k: bbox(load(k)) for k in kinds}
biggest = max(max(b[2] - b[0], b[3] - b[1]) for b in boxes.values()) + 2 * RIM_OUT
scale = (SIZE * 0.94) / biggest
os.makedirs(out_dir, exist_ok=True)
for k in kinds:
    if k not in write:
        continue
    im = load(k)
    rgb = np.asarray(im.convert('RGB')).astype(np.float32)
    A = im.getchannel('A')
    a0 = np.asarray(A) > 127
    inner = A.filter(ImageFilter.MinFilter(2 * RIM_IN + 1))                                   # ตัวหมากที่หดขอบแล้ว
    # สีขอบ: ค่ากลางของพิกเซลสีครีมสว่างในแถบริมของตัวหมาก (ขอบสติกเกอร์เดิม)
    band = a0 & ~(np.asarray(A.filter(ImageFilter.MinFilter(13))) > 127)
    light = band & (rgb[..., 0] > 228) & (rgb[..., 1] > 208) & (rgb[..., 2] > 150)
    cream = np.median(rgb[light], axis=0) if light.sum() > 200 else np.array([253.0, 241.0, 216.0])
    # แผ่นรอง: ขยายออกเท่ากันทุกด้าน แล้วเกลี่ยเส้นรอบรูปให้เรียบ
    base = inner.filter(ImageFilter.MaxFilter(2 * (RIM_IN + RIM_OUT) + 1)).filter(ImageFilter.GaussianBlur(2.2))
    base = base.point(lambda v: 255 if v > 127 else 0).filter(ImageFilter.GaussianBlur(0.9))
    fig = inner.filter(ImageFilter.GaussianBlur(0.8))
    f = np.asarray(fig).astype(np.float32)[..., None] / 255
    b = np.asarray(base).astype(np.float32) / 255
    out_rgb = cream * (1 - f) + rgb * f
    out_a = np.maximum(b, f[..., 0])
    full = Image.fromarray(np.dstack([out_rgb, out_a * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
    box = full.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    piece = full.crop(box)
    pw, ph = max(1, round(piece.width * scale)), max(1, round(piece.height * scale))
    piece = piece.resize((pw, ph), Image.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(piece, ((SIZE - pw) // 2, SIZE - ph - round(SIZE * 0.03)), piece)
    path = os.path.join(out_dir, f'{prefix}-{k}.webp')
    canvas.save(path, 'WEBP', quality=90, method=6)
    print(k, 'cream', cream.astype(int), 'size', (pw, ph), 'bytes', os.path.getsize(path))

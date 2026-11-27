import type { CSSProperties } from 'react'
import { pieceSvg, setById, type Kind } from '../lib/pieceSets'
import type { Color } from '../lib/protocol'

interface Floater {
  set: string
  color: Color
  kind: Kind
  /** ตำแหน่งเป็น % ของจอ */
  x: number
  y: number
  /** ขนาดเป็น px */
  size: number
  /** หมุนเริ่มต้น (องศา) */
  tilt: number
  /** ความยาวหนึ่งรอบของการลอย (วินาที) */
  dur: number
  delay: number
}

// ตัวหมากจากชุดนิทานต่าง ๆ ลอยอยู่ในฉากเวทีของหน้าแรก (ตำแหน่งเป็น % ของฉาก)
// จัดให้มีตัวเด่นหนึ่งตัวตรงกลาง ตัวอื่นเล็กลงและกระจายรอบ ๆ เอียงเพียงเล็กน้อย
// จอกว้าง: ฉากเป็นซุ้มสูงด้านซ้ายของหน้า
const WIDE: Floater[] = [
  { set: 'sky', color: 'w', kind: 'K', x: 50, y: 40, size: 168, tilt: 0, dur: 7.2, delay: 0 },
  { set: 'sky', color: 'b', kind: 'Q', x: 24, y: 50, size: 112, tilt: -5, dur: 6.4, delay: -1.6 },
  { set: 'honey', color: 'b', kind: 'N', x: 76, y: 52, size: 108, tilt: 5, dur: 6.8, delay: -3.1 },
  { set: 'mint', color: 'w', kind: 'P', x: 36, y: 66, size: 92, tilt: 4, dur: 5.8, delay: -2.2 },
  { set: 'cocoa', color: 'b', kind: 'P', x: 64, y: 68, size: 96, tilt: -4, dur: 6.1, delay: -0.8 },
  { set: 'lavender', color: 'w', kind: 'B', x: 30, y: 27, size: 80, tilt: -6, dur: 6.6, delay: -4 },
  { set: 'sakura', color: 'b', kind: 'R', x: 71, y: 28, size: 78, tilt: 6, dur: 5.6, delay: -2.8 },
  { set: 'grape', color: 'b', kind: 'P', x: 14, y: 72, size: 72, tilt: 5, dur: 6.3, delay: -3.6 },
  { set: 'lemon', color: 'w', kind: 'P', x: 86, y: 74, size: 72, tilt: -5, dur: 5.9, delay: -1.2 },
]

// จอแคบ: ฉากเป็นแถบเตี้ยด้านบน
const NARROW: Floater[] = [
  { set: 'sky', color: 'w', kind: 'K', x: 50, y: 50, size: 92, tilt: 0, dur: 7.2, delay: 0 },
  { set: 'sky', color: 'b', kind: 'Q', x: 27, y: 54, size: 66, tilt: -5, dur: 6.4, delay: -1.6 },
  { set: 'honey', color: 'b', kind: 'N', x: 73, y: 54, size: 64, tilt: 5, dur: 6.8, delay: -3.1 },
  { set: 'mint', color: 'w', kind: 'P', x: 10, y: 62, size: 50, tilt: 4, dur: 5.8, delay: -2.2 },
  { set: 'cocoa', color: 'b', kind: 'P', x: 90, y: 62, size: 52, tilt: -4, dur: 6.1, delay: -0.8 },
]

/** หมากรุกตัวละครลอยไปมาเป็นฉากหลังของหน้าแรก เป็นของประดับล้วน */
export function HomeFloaters() {
  return (
    <>
      <div className="home-floaters wide" aria-hidden="true">
        {WIDE.map((f, i) => (
          <FloatingPiece key={i} f={f} order={i} />
        ))}
      </div>
      <div className="home-floaters narrow" aria-hidden="true">
        {NARROW.map((f, i) => (
          <FloatingPiece key={i} f={f} order={i} />
        ))}
      </div>
    </>
  )
}

function FloatingPiece({ f, order }: { f: Floater; order: number }) {
  return (
    <span
      className="home-floater"
      style={
        {
          left: `${f.x}%`,
          top: `${f.y}%`,
          width: f.size,
          height: f.size,
          '--tilt': `${f.tilt}deg`,
          // สองการเคลื่อนไหว: ลอยขึ้นลงตลอด และค่อย ๆ ปรากฏทีละตัวตอนเปิดหน้า
          animationDuration: `${f.dur}s, 0.9s`,
          animationDelay: `${f.delay}s, ${(0.25 + order * 0.09).toFixed(2)}s`,
        } as CSSProperties
      }
    >
      {pieceSvg(setById(f.set), f.color, f.kind, { badge: false, className: 'home-floater-piece' })}
    </span>
  )
}

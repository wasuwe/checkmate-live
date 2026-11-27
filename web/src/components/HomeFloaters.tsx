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

// ตัวละครจากชุดนิทานต่าง ๆ ลอยกระจายอยู่หน้าแรก
// จอกว้าง: ทั่วฉากเวทีด้านซ้ายและขอบจอ ไม่บังปุ่มตรงกลางฝั่งขวา (ตำแหน่งเป็น % ของจอ)
const WIDE: Floater[] = [
  { set: 'mint', color: 'w', kind: 'K', x: 6, y: 14, size: 104, tilt: -10, dur: 6.2, delay: 0 },
  { set: 'mint', color: 'b', kind: 'N', x: 30, y: 8, size: 88, tilt: 8, dur: 5.4, delay: -1.2 },
  { set: 'sky', color: 'w', kind: 'Q', x: 78, y: 7, size: 92, tilt: 6, dur: 6.8, delay: -2.4 },
  { set: 'cocoa', color: 'b', kind: 'K', x: 33, y: 52, size: 120, tilt: -6, dur: 7.2, delay: -0.6 },
  { set: 'cocoa', color: 'w', kind: 'P', x: 22, y: 74, size: 76, tilt: 12, dur: 5.2, delay: -3.1 },
  { set: 'lemon', color: 'w', kind: 'B', x: 5, y: 58, size: 90, tilt: -12, dur: 6.4, delay: -1.8 },
  { set: 'honey', color: 'w', kind: 'P', x: 40, y: 30, size: 70, tilt: 14, dur: 5.8, delay: -4.2 },
  { set: 'grape', color: 'b', kind: 'N', x: 14, y: 36, size: 82, tilt: 10, dur: 6.6, delay: -2.9 },
  { set: 'lavender', color: 'w', kind: 'R', x: 50, y: 82, size: 82, tilt: -8, dur: 7, delay: -1 },
  { set: 'classic', color: 'b', kind: 'P', x: 93, y: 30, size: 72, tilt: -14, dur: 5.6, delay: -2.2 },
  { set: 'soda', color: 'b', kind: 'B', x: 93, y: 72, size: 88, tilt: 10, dur: 6.9, delay: -3.6 },
  { set: 'strawberry', color: 'b', kind: 'Q', x: 52, y: 12, size: 78, tilt: -6, dur: 6.1, delay: -0.3 },
  { set: 'matcha', color: 'w', kind: 'P', x: 6, y: 88, size: 70, tilt: 8, dur: 5.5, delay: -2.6 },
  { set: 'sakura', color: 'b', kind: 'R', x: 24, y: 92, size: 74, tilt: 6, dur: 6.3, delay: -4.8 },
]

// จอแคบ: อยู่ในแถบฉากเวทีด้านบนเท่านั้น (x เป็น % ของความกว้าง y เป็น % ของความสูงแถบ)
const NARROW: Floater[] = [
  { set: 'mint', color: 'w', kind: 'K', x: 12, y: 42, size: 64, tilt: -10, dur: 6.2, delay: 0 },
  { set: 'mint', color: 'b', kind: 'N', x: 33, y: 20, size: 52, tilt: 8, dur: 5.4, delay: -1.2 },
  { set: 'cocoa', color: 'b', kind: 'K', x: 54, y: 52, size: 70, tilt: -6, dur: 7.2, delay: -0.6 },
  { set: 'sky', color: 'w', kind: 'Q', x: 76, y: 22, size: 56, tilt: 6, dur: 6.8, delay: -2.4 },
  { set: 'honey', color: 'w', kind: 'P', x: 90, y: 58, size: 46, tilt: 14, dur: 5.8, delay: -4.2 },
  { set: 'lemon', color: 'w', kind: 'B', x: 33, y: 66, size: 50, tilt: -12, dur: 6.4, delay: -1.8 },
]

/** หมากรุกตัวละครลอยไปมาเป็นฉากหลังของหน้าแรก เป็นของประดับล้วน */
export function HomeFloaters() {
  return (
    <>
      <div className="home-floaters wide" aria-hidden="true">
        {WIDE.map((f, i) => (
          <FloatingPiece key={i} f={f} />
        ))}
      </div>
      <div className="home-floaters narrow" aria-hidden="true">
        {NARROW.map((f, i) => (
          <FloatingPiece key={i} f={f} />
        ))}
      </div>
    </>
  )
}

function FloatingPiece({ f }: { f: Floater }) {
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
          animationDuration: `${f.dur}s`,
          animationDelay: `${f.delay}s`,
        } as CSSProperties
      }
    >
      {pieceSvg(setById(f.set), f.color, f.kind, { badge: false, className: 'home-floater-piece' })}
    </span>
  )
}

import {
  pieceSvg,
  setById,
  squareStyle,
  updateSetPrefs,
  useSetPrefs,
  withActive,
  type BoardSet,
  type Kind,
} from '../lib/pieceSets'
import type { Color } from '../lib/protocol'

/** ปุ่มสลับชุดหมากรุกจากชุดที่เก็บไว้ มีผลกับหน้าจอของผู้เลือกเท่านั้น คู่แข่งเห็นชุดของตัวเอง */
export function PiecePicker() {
  const { slots, active } = useSetPrefs()
  return (
    <div className="row wrap" role="group" aria-label="ชุดหมากรุกที่เก็บไว้">
      {slots.map((id, slot) => {
        const set = setById(id)
        return (
          <button
            key={slot}
            type="button"
            className="chip"
            aria-pressed={slot === active}
            onClick={() => updateSetPrefs((p) => withActive(p, slot))}
          >
            <span
              className="swatch"
              style={{ background: `linear-gradient(135deg, ${set.light} 50%, ${set.dark} 50%)` }}
            />
            {set.name}
          </button>
        )
      })}
    </div>
  )
}

/** ช่องของภาพตัวอย่าง: [ช่องเข้ม?, สี, ชนิดหมาก] สองช่องแรกเป็นช่องใหญ่ ที่เหลือเป็นแถวเล็กด้านล่าง */
const SHOWCASE: [boolean, Color, Kind][] = [
  [true, 'w', 'P'],
  [false, 'b', 'P'],
  [false, 'w', 'K'],
  [true, 'w', 'Q'],
  [false, 'b', 'Q'],
  [true, 'b', 'K'],
]

/**
 * ภาพตัวอย่างของชุดในคลัง: ตัวหมากเป็นตัวเด่น (เจ้าของโปรเจกต์กำหนด 2026-11-27)
 * เบี้ยของสองฝั่ง ซึ่งเป็นตัวละครในนิทานของชุด ยืนตัวใหญ่บนช่องของชุดนั้น (ขาวบนช่องเข้ม ดำบนช่องอ่อน)
 * แถวล่างเป็นคิงกับควีนของทั้งสองฝั่งตัวเล็ก เป็นภาพประกอบ ชื่อชุดแสดงเป็นข้อความข้าง ๆ เสมอ
 */
export function SetPreview({ set }: { set: BoardSet }) {
  return (
    <div className="set-show" aria-hidden="true">
      {SHOWCASE.map(([dark, color, kind], i) => (
        <div key={i} className={i < 2 ? 'big' : undefined} style={squareStyle(set, dark)}>
          {pieceSvg(set, color, kind, { badge: false, className: 'show-piece' })}
        </div>
      ))}
    </div>
  )
}

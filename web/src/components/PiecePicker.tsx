import { pieceSvg, previewCells, setById, updateSetPrefs, useSetPrefs, withActive, type BoardSet } from '../lib/pieceSets'

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

/** กระดานตัวอย่าง 4×4 ของชุด เป็นภาพประกอบ ชื่อชุดแสดงเป็นข้อความข้าง ๆ เสมอ */
export function SetPreview({ set }: { set: BoardSet }) {
  return (
    <div className="mini-board four" aria-hidden="true">
      {previewCells(set).map((c, i) => (
        <div key={i} style={c.style}>
          {c.piece && pieceSvg(set, c.piece[1], c.piece[0], { badge: false, className: 'mini-piece' })}
        </div>
      ))}
    </div>
  )
}

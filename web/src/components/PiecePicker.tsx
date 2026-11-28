import { heroSvg, setById, updateSetPrefs, useSetPrefs, withActive } from '../lib/pieceSets'

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
            <span className="swatch hero-swatch" style={{ background: set.dark }}>
              {heroSvg(set, 'w', { className: 'hero-swatch-art' })}
            </span>
            {set.name}
          </button>
        )
      })}
    </div>
  )
}

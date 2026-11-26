import { pieceSvg, type BoardSet, type Kind } from '../lib/pieceSets'
import type { Color, Promo } from '../lib/protocol'

interface Props {
  color: Color
  /** ชุดหมากรุกที่ผู้เล่นใช้อยู่ ให้ตัวเลือกหน้าตาตรงกับบนกระดาน */
  set: BoardSet
  onPick: (promo: Exclude<Promo, ''>) => void
  onCancel: () => void
}

const CHOICES: { promo: Exclude<Promo, ''>; kind: Kind; name: string }[] = [
  { promo: 'q', kind: 'Q', name: 'ควีน' },
  { promo: 'r', kind: 'R', name: 'เรือ' },
  { promo: 'b', kind: 'B', name: 'บิชอป' },
  { promo: 'n', kind: 'N', name: 'ม้า' },
]

/** ให้ผู้เล่นเลือกว่าจะเลื่อนขั้นเบี้ยเป็นตัวอะไร */
export function PromotionDialog({ color, set, onPick, onCancel }: Props) {
  return (
    <div className="overlay" onClick={onCancel}>
      <div
        className="dialog narrow"
        role="dialog"
        aria-modal="true"
        aria-label="เลือกตัวหมากที่จะเลื่อนขั้น"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="dialog-title">เลื่อนขั้นเบี้ยเป็น</h2>
        <div className="promo-choices">
          {CHOICES.map((c, i) => (
            <button key={c.promo} type="button" className="promo" autoFocus={i === 0} onClick={() => onPick(c.promo)}>
              <span
                className="promo-piece"
                style={{ background: set.dark, borderRadius: 12, border: '2px solid var(--ink)' }}
                aria-hidden="true"
              >
                {pieceSvg(set, color, c.kind, { badge: false })}
              </span>
              {c.name}
            </button>
          ))}
        </div>
        <button type="button" className="link" onClick={onCancel}>
          ยกเลิก
        </button>
      </div>
    </div>
  )
}

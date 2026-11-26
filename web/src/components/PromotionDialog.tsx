import type { PieceRenderers } from '../lib/pieceSets'
import type { Color, Promo } from '../lib/protocol'

interface Props {
  color: Color
  /** ชุดตัวหมากที่ผู้เล่นใช้อยู่ ให้ตัวเลือกหน้าตาตรงกับบนกระดาน */
  pieces: PieceRenderers
  onPick: (promo: Exclude<Promo, ''>) => void
  onCancel: () => void
}

const CHOICES: { promo: Exclude<Promo, ''>; name: string }[] = [
  { promo: 'q', name: 'ควีน' },
  { promo: 'r', name: 'เรือ' },
  { promo: 'b', name: 'บิชอป' },
  { promo: 'n', name: 'ม้า' },
]

/** ให้ผู้เล่นเลือกว่าจะเลื่อนขั้นเบี้ยเป็นตัวอะไร */
export function PromotionDialog({ color, pieces, onPick, onCancel }: Props) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="เลือกตัวหมากที่จะเลื่อนขั้น">
      <div className="dialog">
        <h2>เลื่อนขั้นเบี้ยเป็น</h2>
        <div className="promo-choices">
          {CHOICES.map((c) => (
            <button key={c.promo} type="button" className="promo" onClick={() => onPick(c.promo)}>
              <span className="promo-piece piece-icon" aria-hidden="true">
                {pieces[color + c.promo.toUpperCase()]()}
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

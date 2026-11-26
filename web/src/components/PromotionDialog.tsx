import type { Color, Promo } from '../lib/protocol'

interface Props {
  color: Color
  onPick: (promo: Exclude<Promo, ''>) => void
  onCancel: () => void
}

const CHOICES: { promo: Exclude<Promo, ''>; name: string; white: string; black: string }[] = [
  { promo: 'q', name: 'ควีน', white: '♕', black: '♛' },
  { promo: 'r', name: 'เรือ', white: '♖', black: '♜' },
  { promo: 'b', name: 'บิชอป', white: '♗', black: '♝' },
  { promo: 'n', name: 'ม้า', white: '♘', black: '♞' },
]

/** ให้ผู้เล่นเลือกว่าจะเลื่อนขั้นเบี้ยเป็นตัวอะไร */
export function PromotionDialog({ color, onPick, onCancel }: Props) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="เลือกตัวหมากที่จะเลื่อนขั้น">
      <div className="dialog">
        <h2>เลื่อนขั้นเบี้ยเป็น</h2>
        <div className="promo-choices">
          {CHOICES.map((c) => (
            <button key={c.promo} type="button" className="promo" onClick={() => onPick(c.promo)}>
              <span className="promo-piece" aria-hidden="true">
                {color === 'w' ? c.white : c.black}
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

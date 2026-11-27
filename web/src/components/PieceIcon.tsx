import { pieceSvg, setById, type Kind } from '../lib/pieceSets'
import type { StylePrefs } from '../lib/pieceStyles'
import type { Color } from '../lib/protocol'

const CLASSIC: StylePrefs = { K: 'classic', Q: 'classic', R: 'classic', B: 'classic', N: 'classic', P: 'classic' }

interface Props {
  kind: Kind
  color?: Color
  /** ชุดสีที่ใช้ระบาย (ค่าเริ่มต้น: ชุดตั้งต้นของเว็บ) */
  set?: string
  className?: string
}

/**
 * ตัวหมากคลาสสิกแบบเวกเตอร์สำหรับใช้เป็นไอคอนในหน้าต่าง ๆ (โลโก้ เหรียญ การ์ดเกม)
 * ขนาดตามตัวอักษรของกล่องที่ครอบ (1em) หน้าตาเหมือนกันทุกเครื่อง เป็นของประดับล้วน
 */
export function PieceIcon({ kind, color = 'w', set = 'sky', className }: Props) {
  return pieceSvg(setById(set), color, kind, {
    badge: false,
    styles: CLASSIC,
    className: `piece-icon${className ? ` ${className}` : ''}`,
  })
}

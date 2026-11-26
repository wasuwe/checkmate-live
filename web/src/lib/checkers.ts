// ตำแหน่งของหมากฮอสฝั่งหน้าเว็บ: ใช้แสดงกระดานและแสดงผลล่วงหน้าระหว่างรอเซิร์ฟเวอร์เท่านั้น
// กติกาอยู่ที่เซิร์ฟเวอร์ (server/internal/game/checkers.go) ซึ่งส่งตาเดินที่ถูกกติกามากับ state
//
// ตัวหมาก: C เบี้ย, H ฮอส

import {
  formatPlacement,
  isSquare,
  isWhite,
  parsePlacement,
  squareAt,
  toBoardPosition,
  type BoardPosition,
} from './placement'

export const CHECKERS_START = '1c1c1c1c/c1c1c1c1/8/8/8/8/1C1C1C1C/C1C1C1C1 w'

const PIECES = 'CH'

/** ตำแหน่งสำหรับวาดกระดาน ถ้าอ่านไม่ได้คืนกระดานว่าง */
export function checkersPosition(fen: string): BoardPosition {
  return toBoardPosition(parsePlacement(fen, PIECES))
}

/**
 * ตำแหน่งหลังเดินหนึ่งช่วงจาก from ไป to (ไม่ตรวจกติกา เซิร์ฟเวอร์เป็นผู้ตรวจ)
 * หมากฝ่ายตรงข้ามที่อยู่ระหว่างทางถูกกิน เบี้ยที่ถึงแถวสุดท้ายเป็นฮอส
 * ฝ่ายที่ถึงตาในผลลัพธ์ไม่ถูกเปลี่ยน เพราะหน้าเว็บไม่รู้ว่ากินต่อได้หรือไม่ (เซิร์ฟเวอร์เป็นผู้บอก)
 */
export function checkersApply(fen: string, from: string, to: string): string | null {
  const pos = parsePlacement(fen, PIECES)
  let piece = pos?.squares.get(from)
  if (!pos || !piece || !isSquare(to) || from === to) return null

  const df = to.charCodeAt(0) - from.charCodeAt(0)
  const dr = Number(to[1]) - Number(from[1])
  if (Math.abs(df) !== Math.abs(dr)) return null
  const white = isWhite(piece)
  for (let i = 1; i < Math.abs(df); i++) {
    const mid = squareAt(from.charCodeAt(0) - 97 + Math.sign(df) * i, Number(from[1]) + Math.sign(dr) * i)
    const other = pos.squares.get(mid)
    if (other && isWhite(other) !== white) pos.squares.delete(mid)
  }

  if (piece === 'C' && to[1] === '8') piece = 'H'
  if (piece === 'c' && to[1] === '1') piece = 'h'
  pos.squares.delete(from)
  pos.squares.set(to, piece)
  return formatPlacement(pos)
}

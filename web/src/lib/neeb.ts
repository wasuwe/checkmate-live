// ตำแหน่งของหมากหนีบฝั่งหน้าเว็บ: ใช้แสดงกระดานและแสดงผลล่วงหน้าระหว่างรอเซิร์ฟเวอร์เท่านั้น
// กติกาอยู่ที่เซิร์ฟเวอร์ (server/internal/game/neeb.go) ซึ่งส่งตาเดินที่ถูกกติกามากับ state
//
// หมากทุกตัวเหมือนกัน: O (ตัวพิมพ์ใหญ่คือฝั่งขาว ตัวพิมพ์เล็กคือฝั่งดำ)

import {
  formatPlacement,
  isSquare,
  isWhite,
  parsePlacement,
  squareAt,
  toBoardPosition,
  type BoardPosition,
  type Placement,
} from './placement'

export const NEEB_START = 'oooooooo/8/8/8/8/8/8/OOOOOOOO w'

const PIECES = 'O'
const DIRECTIONS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/** ตำแหน่งสำหรับวาดกระดาน ถ้าอ่านไม่ได้คืนกระดานว่าง */
export function neebPosition(fen: string): BoardPosition {
  return toBoardPosition(parsePlacement(fen, PIECES))
}

/** ช่องของหมากฝ่ายตรงข้ามที่ถูกกินเมื่อหมากสีขาว/ดำ (`white`) เพิ่งเดินมาถึงช่อง `at` */
export function neebCaptures(pos: Placement, at: string, white: boolean): string[] {
  const file = at.charCodeAt(0) - 97
  const rank = Number(at[1])
  const side = (f: number, r: number): 'own' | 'enemy' | '' => {
    if (f < 0 || f > 7 || r < 1 || r > 8) return ''
    const piece = pos.squares.get(squareAt(f, r))
    if (!piece) return ''
    return isWhite(piece) === white ? 'own' : 'enemy'
  }
  const out = new Set<string>()

  // หนีบ: หมากฝ่ายตรงข้ามที่เรียงติดกัน ปิดท้ายด้วยหมากของเรา
  for (const [df, dr] of DIRECTIONS) {
    const run: string[] = []
    let f = file + df
    let r = rank + dr
    while (side(f, r) === 'enemy') {
      run.push(squareAt(f, r))
      f += df
      r += dr
    }
    if (run.length > 0 && side(f, r) === 'own') for (const sq of run) out.add(sq)
  }
  // สอด: หมากฝ่ายตรงข้ามอยู่ติดสองข้างในแนวเดียวกัน
  for (const [df, dr] of [DIRECTIONS[0], DIRECTIONS[2]]) {
    if (side(file + df, rank + dr) === 'enemy' && side(file - df, rank - dr) === 'enemy') {
      out.add(squareAt(file + df, rank + dr))
      out.add(squareAt(file - df, rank - dr))
    }
  }
  return [...out]
}

/**
 * ตำแหน่งหลังเดินจาก from ไป to พร้อมกินหมากที่ถูกหนีบหรือถูกสอด
 * (ไม่ตรวจว่าเดินได้หรือไม่ เซิร์ฟเวอร์เป็นผู้ตรวจ) คืน null ถ้าไม่มีหมากบน from
 */
export function neebApply(fen: string, from: string, to: string): string | null {
  const pos = parsePlacement(fen, PIECES)
  const piece = pos?.squares.get(from)
  if (!pos || !piece || !isSquare(to) || from === to || pos.squares.has(to)) return null
  pos.squares.delete(from)
  pos.squares.set(to, piece)
  for (const sq of neebCaptures(pos, to, isWhite(piece))) pos.squares.delete(sq)
  pos.turn = pos.turn === 'w' ? 'b' : 'w'
  return formatPlacement(pos)
}

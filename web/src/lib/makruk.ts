// ตำแหน่งของหมากรุกไทยฝั่งหน้าเว็บ: ใช้แสดงกระดานและแสดงผลล่วงหน้าระหว่างรอเซิร์ฟเวอร์เท่านั้น
// กติกาอยู่ที่เซิร์ฟเวอร์ (server/internal/game/makruk.go) ซึ่งส่งตาเดินที่ถูกกติกามากับ state
//
// ตัวหมาก: K ขุน, M เม็ด, S โคน, N ม้า, R เรือ, P เบี้ย, F เบี้ยหงาย

import { formatPlacement, isSquare, parsePlacement, toBoardPosition, type BoardPosition } from './placement'

export const MAKRUK_START = 'rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w'

const PIECES = 'KMSNRPF'

/** ตำแหน่งสำหรับวาดกระดาน ถ้าอ่านไม่ได้คืนกระดานว่าง */
export function makrukPosition(fen: string): BoardPosition {
  return toBoardPosition(parsePlacement(fen, PIECES))
}

/**
 * ตำแหน่งหลังย้ายหมากจาก from ไป to (ไม่ตรวจกติกา เซิร์ฟเวอร์เป็นผู้ตรวจ)
 * เบี้ยที่ถึงแถวที่ 6 ของตัวเองหงายทันที คืน null ถ้าไม่มีหมากบน from
 */
export function makrukApply(fen: string, from: string, to: string): string | null {
  const pos = parsePlacement(fen, PIECES)
  let piece = pos?.squares.get(from)
  if (!pos || !piece || !isSquare(to) || from === to) return null
  if (piece === 'P' && to[1] === '6') piece = 'F'
  if (piece === 'p' && to[1] === '3') piece = 'f'
  pos.squares.delete(from)
  pos.squares.set(to, piece)
  pos.turn = pos.turn === 'w' ? 'b' : 'w'
  return formatPlacement(pos)
}

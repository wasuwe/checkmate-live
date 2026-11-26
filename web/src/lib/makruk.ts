// ตำแหน่งของหมากรุกไทยฝั่งหน้าเว็บ: ใช้แสดงกระดานและแสดงผลล่วงหน้าระหว่างรอเซิร์ฟเวอร์เท่านั้น
// กติกาอยู่ที่เซิร์ฟเวอร์ (server/internal/game/makruk.go) ซึ่งส่งตาเดินที่ถูกกติกามากับ state
//
// รูปแบบตำแหน่ง: "<กระดาน> <ฝ่ายที่ถึงตา>" เช่น "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w"
// ตัวหมาก: K ขุน, M เม็ด, S โคน, N ม้า, R เรือ, P เบี้ย, F เบี้ยหงาย (ตัวพิมพ์เล็กคือฝั่งดำ)

export const MAKRUK_START = 'rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w'

const PIECES = 'KMSNRPF'

/** ตำแหน่งในรูปที่ react-chessboard รับ: ช่อง → รหัสหมาก เช่น { e3: { pieceType: 'wP' } } */
export type BoardPosition = Record<string, { pieceType: string }>

function parse(fen: string): { squares: Map<string, string>; turn: string } | null {
  const [placement, turn] = fen.split(' ')
  const rows = (placement ?? '').split('/')
  if (rows.length !== 8 || (turn !== 'w' && turn !== 'b')) return null
  const squares = new Map<string, string>()
  for (let r = 0; r < 8; r++) {
    let file = 0
    for (const ch of rows[r]) {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch)
      } else if (PIECES.includes(ch.toUpperCase()) && file < 8) {
        squares.set(String.fromCharCode(97 + file) + (8 - r), ch)
        file++
      } else {
        return null
      }
    }
    if (file !== 8) return null
  }
  return { squares, turn }
}

/** ตำแหน่งสำหรับวาดกระดาน ถ้าอ่านไม่ได้คืนกระดานว่าง */
export function makrukPosition(fen: string): BoardPosition {
  const out: BoardPosition = {}
  for (const [square, ch] of parse(fen)?.squares ?? []) {
    out[square] = { pieceType: (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase() }
  }
  return out
}

/**
 * ตำแหน่งหลังย้ายหมากจาก from ไป to (ไม่ตรวจกติกา เซิร์ฟเวอร์เป็นผู้ตรวจ)
 * เบี้ยที่ถึงแถวที่ 6 ของตัวเองหงายทันที คืน null ถ้าไม่มีหมากบน from
 */
export function makrukApply(fen: string, from: string, to: string): string | null {
  const pos = parse(fen)
  let piece = pos?.squares.get(from)
  if (!pos || !piece || !/^[a-h][1-8]$/.test(to) || from === to) return null
  if (piece === 'P' && to[1] === '6') piece = 'F'
  if (piece === 'p' && to[1] === '3') piece = 'f'
  pos.squares.delete(from)
  pos.squares.set(to, piece)

  const rows: string[] = []
  for (let rank = 8; rank >= 1; rank--) {
    let row = ''
    let empty = 0
    for (let file = 0; file < 8; file++) {
      const ch = pos.squares.get(String.fromCharCode(97 + file) + rank)
      if (!ch) {
        empty++
        continue
      }
      if (empty > 0) row += empty
      empty = 0
      row += ch
    }
    rows.push(empty > 0 ? row + empty : row)
  }
  return `${rows.join('/')} ${pos.turn === 'w' ? 'b' : 'w'}`
}

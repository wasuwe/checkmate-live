// ตำแหน่งบนกระดาน 8×8 ของเกมที่กติกาอยู่ฝั่งเซิร์ฟเวอร์ (หมากรุกไทย หมากฮอส)
// รูปแบบ: "<กระดาน> <ฝ่ายที่ถึงตา>" โดยกระดานเขียนแบบ FEN ทีละแถวจากแถว 8 ลงมา
// ตัวพิมพ์ใหญ่คือฝั่งขาว ตัวพิมพ์เล็กคือฝั่งดำ

/** ตำแหน่งในรูปที่ react-chessboard รับ: ช่อง → รหัสหมาก เช่น { e3: { pieceType: 'wP' } } */
export type BoardPosition = Record<string, { pieceType: string }>

export interface Placement {
  /** ช่อง → ตัวอักษรของหมาก */
  squares: Map<string, string>
  turn: 'w' | 'b'
}

export function squareAt(file: number, rank: number): string {
  return String.fromCharCode(97 + file) + rank
}

/** อ่านตำแหน่ง `letters` คือตัวอักษรของหมากที่เกมนั้นมี (ตัวพิมพ์ใหญ่) คืน null ถ้าอ่านไม่ได้ */
export function parsePlacement(fen: string, letters: string): Placement | null {
  const [board, turn] = fen.split(' ')
  const rows = (board ?? '').split('/')
  if (rows.length !== 8 || (turn !== 'w' && turn !== 'b')) return null
  const squares = new Map<string, string>()
  for (let r = 0; r < 8; r++) {
    let file = 0
    for (const ch of rows[r]) {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch)
      } else if (letters.includes(ch.toUpperCase()) && file < 8) {
        squares.set(squareAt(file, 8 - r), ch)
        file++
      } else {
        return null
      }
    }
    if (file !== 8) return null
  }
  return { squares, turn }
}

export function formatPlacement(pos: Placement): string {
  const rows: string[] = []
  for (let rank = 8; rank >= 1; rank--) {
    let row = ''
    let empty = 0
    for (let file = 0; file < 8; file++) {
      const ch = pos.squares.get(squareAt(file, rank))
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
  return `${rows.join('/')} ${pos.turn}`
}

/** ตำแหน่งสำหรับวาดกระดาน ถ้าอ่านไม่ได้คืนกระดานว่าง */
export function toBoardPosition(pos: Placement | null): BoardPosition {
  const out: BoardPosition = {}
  for (const [square, ch] of pos?.squares ?? []) {
    out[square] = { pieceType: (isWhite(ch) ? 'w' : 'b') + ch.toUpperCase() }
  }
  return out
}

export function isWhite(piece: string): boolean {
  return piece === piece.toUpperCase()
}

export function isSquare(value: string): boolean {
  return /^[a-h][1-8]$/.test(value)
}

import type { CSSProperties } from 'react'

// ---------- ป้ายคำอธิบายของหมากที่ชี้ ----------
// เจ้าของโปรเจกต์กำหนด 2026-11-28: คำอธิบายแสดงข้างตัวหมากที่ชี้ (เดิมอยู่ขอบล่างของกระดานและในแผงข้าง ไกลจากหมาก)
// ป้ายวางได้สี่ด้านของช่อง เลือกด้านที่ป้ายอยู่ในกระดานและทับช่องที่ไฮไลต์อยู่น้อยที่สุด รองลงมาคือทับตัวหมากน้อยที่สุด
// ขนาดป้ายขึ้นกับข้อความ จึงประมาณพื้นที่ที่ป้ายกินเป็น TAG_COLS × TAG_ROWS ช่องเพื่อให้คะแนนเท่านั้น ตำแหน่งจริงเป็นงานของ CSS

type TagSide = 'above' | 'below' | 'right' | 'left'

interface TagPlace {
  side: TagSide
  tag: CSSProperties
  tail: CSSProperties
}

const TAG_COLS = 4
const TAG_ROWS = 2
/** ลำดับที่ชอบเมื่อคะแนนเท่ากัน: เหนือหมากก่อน (นิ้วและเมาส์ไม่บัง) */
const TAG_SIDES: TagSide[] = ['above', 'right', 'left', 'below']
const CELL = 12.5

/** ช่องที่ป้ายกินเมื่อวางด้าน side ของช่อง (col, row นับจากมุมซ้ายบนของกระดานที่เห็น) หรือ null ถ้าป้ายล้นกระดาน */
function tagCells(side: TagSide, col: number, row: number): [number, number][] | null {
  let c0: number
  let r0: number
  if (side === 'above' || side === 'below') {
    r0 = side === 'above' ? row - TAG_ROWS : row + 1
    c0 = Math.min(Math.max(col - 1, 0), 8 - TAG_COLS)
  } else {
    c0 = side === 'right' ? col + 1 : col - TAG_COLS
    r0 = Math.min(Math.max(row - 1, 0), 8 - TAG_ROWS)
  }
  if (r0 < 0 || r0 + TAG_ROWS > 8 || c0 < 0 || c0 + TAG_COLS > 8) return null
  const cells: [number, number][] = []
  for (let r = r0; r < r0 + TAG_ROWS; r++) for (let c = c0; c < c0 + TAG_COLS; c++) cells.push([c, r])
  return cells
}

export function placeTag(square: string, flipped: boolean, lit: ReadonlySet<string>, occupied: ReadonlySet<string>): TagPlace {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1]) - 1
  const col = flipped ? 7 - file : file
  const row = flipped ? rank : 7 - rank
  const nameOf = (c: number, r: number) => String.fromCharCode(97 + (flipped ? 7 - c : c)) + String(flipped ? r + 1 : 8 - r)
  let side: TagSide = col <= 3 ? 'right' : 'left'
  let best = Infinity
  for (const candidate of TAG_SIDES) {
    const cells = tagCells(candidate, col, row)
    if (!cells) continue
    let score = 0
    for (const [c, r] of cells) {
      const sq = nameOf(c, r)
      if (lit.has(sq)) score += 4
      else if (occupied.has(sq)) score += 1
    }
    if (score < best) {
      best = score
      side = candidate
    }
  }
  const x = (col + 0.5) * CELL
  const y = (row + 0.5) * CELL
  switch (side) {
    case 'above':
      return { side, tag: { '--tag-x': `${x}%`, top: `${row * CELL}%` } as CSSProperties, tail: { left: `${x}%`, top: `${row * CELL}%` } }
    case 'below':
      return { side, tag: { '--tag-x': `${x}%`, top: `${(row + 1) * CELL}%` } as CSSProperties, tail: { left: `${x}%`, top: `${(row + 1) * CELL}%` } }
    case 'right':
      return { side, tag: { left: `${(col + 1) * CELL}%`, '--tag-y': `${y}%` } as CSSProperties, tail: { left: `${(col + 1) * CELL}%`, top: `${y}%` } }
    case 'left':
      return { side, tag: { right: `${(8 - col) * CELL}%`, '--tag-y': `${y}%` } as CSSProperties, tail: { left: `${col * CELL}%`, top: `${y}%` } }
  }
}

import type { CSSProperties } from 'react'
import { characterSvg, type BoardSet } from '../lib/pieceSets'
import type { Color } from '../lib/protocol'

interface Props {
  /** กินหมาก หรือชนะบนกระดาน (Checkmate) ฉากชนะใหญ่และอยู่นานกว่า */
  kind: 'capture' | 'mate'
  /** คำตัวโตบนแถบ เช่น "กิน!" หรือ "Checkmate!" */
  word: string
  /** ฝั่งของหมากที่เพิ่งเดิน */
  color: Color
  set: BoardSet
  /** ชนิดของหมากที่เพิ่งเดิน (ตัวอักษรใน FEN เป็นตัวพิมพ์ใหญ่) ชุดที่มีภาพวาดจะได้ภาพของหมากชนิดนั้น */
  pieceKind?: string
  /** ตัวละครโผล่จากด้านไหนของกระดาน: ฝั่งของผู้ดูมาจากขวา คู่แข่งมาจากซ้าย */
  from: 'left' | 'right'
}

/** ตำแหน่งของดาวที่พุ่งผ่านแถบ: [ซ้าย %, บน %, ขนาด cqw, หน่วงเวลา วินาที] */
const STARS: [number, number, number, number][] = [
  [12, 30, 5, 0.05],
  [30, 64, 3.4, 0.14],
  [48, 26, 4.2, 0.02],
  [66, 70, 5.4, 0.1],
  [82, 34, 3.6, 0.18],
  [92, 60, 4.6, 0.07],
]

/**
 * ฉากตัวละครโผล่ (เจ้าของโปรเจกต์กำหนด 2026-11-28 จากเกมไพ่ที่ตัวละครขึ้นมาเต็มจอตอนลงไพ่ชุดใหญ่):
 * ตอนกินหมาก ตัวที่กินโผล่ขึ้นมาบนแถบสีที่พาดเฉียงกลางกระดาน พร้อมคำตัวโต แล้วหายไปเอง และตอน Checkmate เป็นฉากเดียวกันที่ใหญ่กว่า
 * แถบเป็นสีของฝั่งนั้น (ฝ่ายดำ: สีเข้มของชุด / ฝ่ายขาว: สีช่องเข้มของชุด) ตัวละครของผู้ดูมาจากขวา ของคู่แข่งมาจากซ้าย
 * เป็นของประดับล้วน ไม่รับการกด กระดานข้างใต้ยังเล่นต่อได้ การเคลื่อนไหวอยู่ใน CSS (.cutin) ผู้ที่ปิดการเคลื่อนไหวไม่เห็นฉากนี้
 */
export function CutIn({ kind, word, color, set, pieceKind, from }: Props) {
  // แถบของฝ่ายขาวใช้สีช่องเข้มของชุด (ตัวละครสีครีมจึงเด่น) ของฝ่ายดำใช้สีเข้มของชุด ตัวอักษรสีครีมทั้งคู่
  const vars = { '--cut': color === 'w' ? set.dark : set.b, '--cut-ink': '#FFF6DA' } as CSSProperties
  return (
    <div className={`cutin ${kind} from-${from} side-${color}`} style={vars} aria-hidden="true">
      <div className="cutin-band">
        <span className="cutin-speed" />
      </div>
      <span className="cutin-slash a" />
      <span className="cutin-slash b" />
      {STARS.map(([left, top, size, delay], i) => (
        <span key={i} className="cutin-star" style={{ left: `${left}%`, top: `${top}%`, width: `${size}cqw`, animationDelay: `${delay}s` }} />
      ))}
      {characterSvg(set, color, pieceKind, { className: 'cutin-hero' })}
      <span className="cutin-word">{word}</span>
    </div>
  )
}

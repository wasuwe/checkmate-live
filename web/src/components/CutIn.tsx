import type { CSSProperties } from 'react'
import { characterSvg, type BoardSet } from '../lib/pieceSets'
import type { Color } from '../lib/protocol'

interface Props {
  /** กินหมาก Check หรือชนะบนกระดาน (Checkmate) ฉากชนะใหญ่และอยู่นานกว่า */
  kind: 'capture' | 'check' | 'mate'
  /** คำตัวโตบนแถบ: คำที่ตัวละครพูดกับฝ่ายตรงข้าม อิงเนื้อเรื่องนิทาน เช่น "คราวนี้ไม่ปล่อยนะ" */
  word: string
  /** ป้ายเล็กเหนือคำตัวโต บอกว่าเกิดอะไรขึ้น เช่น "กินม้า" "Check!" หรือ "Checkmate!" */
  tag: string
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
 * ตอนกินหมาก ตัวที่กินโผล่ขึ้นมาบนแถบสีที่พาดกลางกระดาน พร้อมคำตัวโตที่ตัวละครพูดกับฝ่ายตรงข้ามตามเนื้อเรื่องนิทาน
 * และป้ายเล็กบอกว่าเกิดอะไรขึ้น แล้วหายไปเอง ตอน Check ใช้ฉากเดียวกัน ตอน Checkmate เป็นฉากเดียวกันที่ใหญ่กว่า
 * แถบเป็นสีของฝั่งนั้น (ฝ่ายดำ: สีเข้มของชุด / ฝ่ายขาว: สีช่องเข้มของชุด) ตัวละครของผู้ดูมาจากขวา ของคู่แข่งมาจากซ้าย
 * เป็นของประดับล้วน ไม่รับการกด กระดานข้างใต้ยังเล่นต่อได้ การเคลื่อนไหวอยู่ใน CSS (.cutin) ผู้ที่ปิดการเคลื่อนไหวไม่เห็นฉากนี้
 */
/** จำนวนช่องตัวอักษรที่คำกินจริง: สระบนล่างและวรรณยุกต์ของไทยซ้อนอยู่กับตัวหน้า ไม่กินที่เพิ่ม */
const visualLength = (text: string) => text.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '').length

// ชื่อคลาสของชนิดฉากขึ้นต้นด้วย kind- เพราะเว็บมีคลาส .check ของช่องติ๊กอยู่แล้ว ถ้าใช้ชื่อเดียวกันฉากจะถูกย่อเหลือเท่าช่องติ๊ก
export function CutIn({ kind, word, tag, color, set, pieceKind, from }: Props) {
  // คำตัวโตขึ้นได้สองบรรทัด จุดขึ้นบรรทัดมากับคำ (เครื่องหมาย |) ไม่ให้เบราว์เซอร์ตัดคำไทยเอง
  // ขนาดตัวอักษรคิดจากบรรทัดที่ยาวที่สุด ให้พอดีกับครึ่งแถบที่ว่าง (อีกครึ่งเป็นตัวละคร)
  const lines = word.split('|')
  const longest = Math.max(2, ...lines.map(visualLength))
  const wordSize = Math.max(6, Math.min(lines.length === 1 ? 19 : 12.5, 45 / (longest * 0.6)))
  // แถบของฝ่ายขาวใช้สีช่องเข้มของชุด (ตัวละครสีครีมจึงเด่น) ของฝ่ายดำใช้สีเข้มของชุด ตัวอักษรสีครีมทั้งคู่
  const vars = { '--cut': color === 'w' ? set.dark : set.b, '--cut-ink': '#FFF6DA' } as CSSProperties
  return (
    <div className={`cutin kind-${kind} from-${from} side-${color}`} style={vars} aria-hidden="true">
      <div className="cutin-band">
        <span className="cutin-speed" />
      </div>
      <span className="cutin-slash a" />
      <span className="cutin-slash b" />
      {STARS.map(([left, top, size, delay], i) => (
        <span key={i} className="cutin-star" style={{ left: `${left}%`, top: `${top}%`, width: `${size}cqw`, animationDelay: `${delay}s` }} />
      ))}
      {characterSvg(set, color, pieceKind, { className: 'cutin-hero' })}
      {/* ข้อความอยู่ครึ่งแถบฝั่งตรงข้ามกับตัวละคร: ป้ายเล็กบอกเหตุการณ์ แล้วคำพูดตัวโตข้างใต้ */}
      <span className="cutin-text">
        <span className="cutin-tag">{tag}</span>
        <span className="cutin-word" style={{ fontSize: `${wordSize.toFixed(2)}cqw` }}>
          {lines.map((line, i) => (
            <span key={i}>{line}</span>
          ))}
        </span>
      </span>
    </div>
  )
}

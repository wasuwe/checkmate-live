import type { CSSProperties } from 'react'
import { pieceSvg, squareStyle, type BoardSet } from '../lib/pieceSets'

/**
 * การ์ดสะสมของชุดหมากรุกหนึ่งชุด (เจ้าของโปรเจกต์กำหนด 2026-11-28 จากภาพอ้างอิง: ตัวละครน่ารักเส้นขอบหนาลงสีเรียบ
 * อยู่ในกรอบการ์ดลายทอง มีริบบิ้นชื่อ ดาวสี่แฉก และลายข้าวหลามตัด ความขลังมาจากลวดลายและประกาย ไม่ใช่ภาพสมจริง)
 *
 * ทั้งการ์ดวาดในโค้ด จึงใช้สีของชุดนั้นได้เอง: พื้นการ์ดเป็นสีเข้มของชุด (สีหมากฝ่ายดำ) หน้าต่างโค้งกลางการ์ดเป็นช่องกระดาน
 * สองสีของชุดแบ่งเฉียง มีตัวละครนิทานของสองฝั่งยืนเยื้องกัน (ขาวบนช่องเข้ม ดำบนช่องอ่อน) กรอบ ประกาย และริบบิ้นเป็นเส้นทองเหมือนกันทุกชุด
 * ชื่อชุดบนริบบิ้นเป็นข้อความจริง (ตัวอักษรของเว็บ) ขนาดทุกอย่างคิดจากความกว้างการ์ด (หน่วย cqw) การ์ดจึงย่อขยายได้
 */
export function FableCard({ set, className }: { set: BoardSet; className?: string }) {
  const vars = { '--card-deep': set.b } as CSSProperties
  // ลายของช่องกระดานถูกออกแบบสำหรับช่องจัตุรัส ในหน้าต่างจึงเรียงซ้ำเป็นตารางช่อง ไม่ยืด
  const ground = (dark: boolean): CSSProperties => ({ ...squareStyle(set, dark), backgroundSize: '50% auto', backgroundRepeat: 'repeat' })
  return (
    <span className={`fable-card${className ? ' ' + className : ''}`} style={vars}>
      {/* พื้นแบ่งเฉียง: มุมล่างซ้ายเป็นช่องเข้ม (ตัวละครฝ่ายขาวยืนหน้า) มุมบนขวาเป็นช่องอ่อน (ตัวละครฝ่ายดำยืนหลัง) */}
      <span className="fc-window" aria-hidden="true">
        <span className="fc-ground" style={ground(false)} />
        <span className="fc-ground dark" style={ground(true)} />
        {pieceSvg(set, 'b', 'P', { badge: false, className: 'fc-hero back' })}
        {pieceSvg(set, 'w', 'P', { badge: false, className: 'fc-hero front' })}
      </span>
      <CardFrame />
      <span className="fc-name">{set.name}</span>
    </span>
  )
}

const GOLD = '#F0C987'
const CREAM = '#FFF6DA'
const AMBER = '#F29A4A'

/** ดาวสี่แฉก */
const star = (cx: number, cy: number, s: number): string =>
  `M${cx} ${cy - s}Q${cx} ${cy} ${cx + s} ${cy}Q${cx} ${cy} ${cx} ${cy + s}Q${cx} ${cy} ${cx - s} ${cy}Q${cx} ${cy} ${cx} ${cy - s}Z`

/** ดาวสี่แฉกดวงใหญ่ที่เรืองแสง: สีครีมขอบส้มทอง */
function Spark({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  return (
    <g className="fc-spark" style={{ animationDelay: `${delay}s`, transformOrigin: `${x}px ${y}px` }}>
      <circle cx={x} cy={y} r={size * 0.9} fill="#FFE9A6" opacity="0.4" filter="url(#fc-glow)" />
      <path d={star(x, y, size)} fill={CREAM} stroke={AMBER} strokeWidth="1.4" strokeLinejoin="round" />
    </g>
  )
}

/** ลายม้วนที่มุมกรอบ วาดที่มุมซ้ายบนแล้วพลิกไปมุมอื่น */
function Corner({ flipX, flipY }: { flipX?: boolean; flipY?: boolean }) {
  const transform = `translate(${flipX ? 200 : 0} ${flipY ? 300 : 0}) scale(${flipX ? -1 : 1} ${flipY ? -1 : 1})`
  return (
    <g transform={transform} fill="none" stroke={GOLD} strokeWidth="1.4" strokeLinecap="round">
      <path d="M13 40C13 25 25 13 40 13" />
      <path d="M19 33C19 25.5 25.5 19 33 19C28 19.5 25 23 25.5 27" />
      <circle cx="13" cy="46" r="1.5" fill={GOLD} stroke="none" />
      <circle cx="46" cy="13" r="1.5" fill={GOLD} stroke="none" />
    </g>
  )
}

/** กรอบ ประกาย ตรา และริบบิ้นของการ์ด: เส้นทองบนพื้นเข้ม เหมือนกันทุกชุด (พิกัดเป็นหน่วยของการ์ดขนาด 200 × 300) */
function CardFrame() {
  // หน้าต่างโค้ง: ซ้าย 26 ขวา 174 ยอดโค้งที่ 36 ฐานที่ 214 (ตรงกับ .fc-window ใน CSS)
  const arch = 'M26 214V110A74 74 0 0 1 174 110V214Z'
  return (
    <svg className="fc-frame" viewBox="0 0 200 300" aria-hidden="true">
      <defs>
        <filter id="fc-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <linearGradient id="fc-ribbon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FBE7AE" />
          <stop offset="1" stopColor="#DFAE58" />
        </linearGradient>
      </defs>

      {/* ขอบการ์ดสองชั้น */}
      <rect x="5.5" y="5.5" width="189" height="289" rx="13" fill="none" stroke={GOLD} strokeWidth="1.8" />
      <rect x="9.5" y="9.5" width="181" height="281" rx="10" fill="none" stroke={GOLD} strokeWidth="0.7" opacity="0.6" />
      <Corner />
      <Corner flipX />
      <Corner flipY />
      <Corner flipX flipY />

      {/* กรอบหน้าต่างโค้งสองชั้น */}
      <path d={arch} fill="none" stroke={GOLD} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M21.5 218.5V110A78.5 78.5 0 0 1 178.5 110V218.5Z" fill="none" stroke={GOLD} strokeWidth="0.8" opacity="0.7" />
      {/* เส้นแบ่งเฉียงของสองฝั่ง (ตรงกับ clip-path ของ .fc-ground.dark) */}
      <path d="M26 75.2L174 174.8" stroke={GOLD} strokeWidth="1.1" opacity="0.8" />

      {/* ตราบนยอดโค้ง: ดาวในวงทอง มีปีกเล็กสองข้าง */}
      <path d="M84 27C77 22 71 24 66 29C73 28 79 30 84 33M116 27C123 22 129 24 134 29C127 28 121 30 116 33" fill={GOLD} opacity="0.9" />
      <circle cx="100" cy="29" r="10.5" fill="var(--card-deep)" stroke={GOLD} strokeWidth="1.8" />
      <path d={star(100, 29, 7)} fill={CREAM} stroke={AMBER} strokeWidth="1" strokeLinejoin="round" />

      {/* ดาวดวงเล็กรอบกรอบ */}
      <g fill={GOLD}>
        <path d={star(21, 78, 3.4)} />
        <path d={star(180, 96, 2.6)} />
        <path d={star(18, 168, 2.6)} />
        <path d={star(182, 190, 3.4)} />
        <circle cx="36" cy="52" r="1.1" />
        <circle cx="166" cy="48" r="1.1" />
        <circle cx="186" cy="140" r="1.1" />
        <circle cx="14" cy="120" r="1.1" />
      </g>
      <Spark x={166} y={70} size={12} delay={0} />
      <Spark x={31} y={196} size={9.5} delay={0.9} />
      <Spark x={150} y={222} size={6} delay={1.6} />

      {/* ริบบิ้นชื่อ: ปลายพับสองข้างอยู่ใต้แถบกลาง */}
      <g stroke="#8A6A2A" strokeWidth="0.8" strokeLinejoin="round">
        <path d="M24 238L7 242L14 253L7 264L30 262Z" fill="#C8963F" />
        <path d="M176 238L193 242L186 253L193 264L170 262Z" fill="#C8963F" />
        <path d="M20 232Q100 226 180 232V264Q100 258 20 264Z" fill="url(#fc-ribbon)" />
      </g>
      <path d="M24 235.5Q100 229.5 176 235.5M24 260.5Q100 254.5 176 260.5" fill="none" stroke="#FFF8E0" strokeWidth="0.7" opacity="0.8" />

      {/* ลายใต้ริบบิ้น: เบี้ยตัวเล็กระหว่างข้าวหลามตัดสองเม็ด */}
      <g fill={GOLD}>
        <path d="M100 271.5a3 3 0 0 1 1.9 5.3c1.4 1.2 2.3 3 2.6 5.2h-9c0.3-2.2 1.2-4 2.6-5.2a3 3 0 0 1 1.9-5.3zM94.5 283.5h11v2h-11z" />
        <path d="M82 275.5L85.5 279L82 282.5L78.5 279ZM118 275.5L121.5 279L118 282.5L114.5 279Z" />
        <circle cx="70" cy="279" r="1.1" />
        <circle cx="130" cy="279" r="1.1" />
      </g>
    </svg>
  )
}

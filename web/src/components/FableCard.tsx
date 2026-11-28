import type { CSSProperties, ReactNode } from 'react'
import { heroSvg, setById, type BoardSet, type Kind } from '../lib/pieceSets'
import { PieceIcon } from './PieceIcon'

/**
 * การ์ดสะสมของชุดหมากรุกหนึ่งชุด (เจ้าของโปรเจกต์กำหนด 2026-11-28 จากภาพอ้างอิง: ตัวละครน่ารักเส้นขอบหนาลงสีเรียบ
 * อยู่ในกรอบการ์ดลายทอง มีริบบิ้นชื่อ ดาวสี่แฉก และลายข้าวหลามตัด ความขลังมาจากลวดลายและประกาย ไม่ใช่ภาพสมจริง)
 *
 * ทั้งการ์ดวาดในโค้ด จึงใช้สีของชุดนั้นได้เอง: พื้นการ์ดเป็นสีเข้มของชุด (สีหมากฝ่ายดำ) หน้าต่างโค้งกลางการ์ดเป็นช่องกระดาน
 * สองสีของชุดแบ่งเฉียง มีตัวละครนิทานของสองฝั่งยืนเยื้องกัน (ขาวบนช่องเข้ม ดำบนช่องอ่อน) กรอบ ประกาย และริบบิ้นเป็นเส้นทองเหมือนกันทุกชุด
 * ชื่อชุดบนริบบิ้นเป็นข้อความจริง (ตัวอักษรของเว็บ) ขนาดทุกอย่างคิดจากความกว้างการ์ด (หน่วย cqw) การ์ดจึงย่อขยายได้
 */
/** สีเส้นของตัวละครบนการ์ด: น้ำตาลทอง เข้ากับกรอบและขอบสติกเกอร์สีทอง */
const CARD_INK = '#7A4416'

/**
 * โครงของการ์ด (เจ้าของโปรเจกต์ส่งภาพเป้าหมาย 2026-11-28: การ์ดราชสีห์กอดตัวคิง มีหนูตัวเล็กยืนบนหัว)
 * พื้นสีเข้มของชุดทั้งใบ ตัวละครตัวใหญ่อยู่กลางการ์ด มีขอบทองรอบตัวแบบสติกเกอร์ ดาวเรืองแสงกระจายรอบ ๆ
 * กรอบทอง และริบบิ้นชื่อใบใหญ่ด้านล่าง ภาพในการ์ดมาจาก children
 */
function CardShell({ set, name, className, children }: { set: BoardSet; name: string; className?: string; children: ReactNode }) {
  const vars = { '--card-deep': set.b } as CSSProperties
  return (
    <span className={`fable-card${className ? ' ' + className : ''}`} style={vars}>
      <CardFrame />
      <span className="fc-stage" aria-hidden="true">
        {children}
      </span>
      <CardRibbon />
      <span className="fc-name">{name}</span>
    </span>
  )
}

/** การ์ดสะสมของชุดหมากรุก: ตัวละครฝ่ายดำตัวใหญ่ ตัวละครฝ่ายขาวตัวเล็กยืนอยู่บนหัว */
export function FableCard({ set, className }: { set: BoardSet; className?: string }) {
  return (
    <CardShell set={set} name={set.name} className={className}>
      {heroSvg(set, 'b', { className: 'fc-hero big', ink: CARD_INK })}
      {heroSvg(set, 'w', { className: 'fc-hero small', ink: CARD_INK })}
    </CardShell>
  )
}

/** หน้าตาของการ์ดแต่ละเกม: ชุดที่ให้สีและตัวละคร กับตัวหมากที่เป็นสัญลักษณ์ของเกมนั้น */
const GAME_CARDS: Record<string, { set: string; piece: Kind }> = {
  chess: { set: 'sky', piece: 'N' },
  makruk: { set: 'honey', piece: 'R' },
  checkers: { set: 'mint', piece: 'H' },
  neeb: { set: 'lavender', piece: 'O' },
}

/**
 * การ์ดของเกมในหน้าเลือกเกม หน้าตาเดียวกับการ์ดสะสมของชุด: ตัวละครตัวใหญ่กอดตัวหมากที่เป็นสัญลักษณ์ของเกม
 * (บอกว่าเป็นเกมอะไร) มีตัวละครอีกตัวยืนบนหัว แต่ละเกมมีสีของตัวเอง ชื่อเกมอยู่บนริบบิ้น
 */
export function GameCard({ game, name }: { game: string; name: string }) {
  const theme = GAME_CARDS[game] ?? GAME_CARDS.chess
  const set = setById(theme.set)
  return (
    <CardShell set={set} name={name} className="game">
      {heroSvg(set, 'b', { className: 'fc-hero big', ink: CARD_INK })}
      {heroSvg(set, 'w', { className: 'fc-hero small', ink: CARD_INK })}
      <PieceIcon kind={theme.piece} color="w" set={theme.set} className="fc-hero held" />
    </CardShell>
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

/** กรอบ ตรา และดาวของการ์ด: เส้นทองบนพื้นเข้ม เหมือนกันทุกใบ อยู่ใต้ตัวละคร (พิกัดเป็นหน่วยของการ์ดขนาด 200 × 300) */
function CardFrame() {
  return (
    <svg className="fc-frame" viewBox="0 0 200 300" aria-hidden="true">
      <defs>
        <filter id="fc-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>

      {/* ขอบการ์ดสองชั้น และซุ้มโค้งเส้นบางด้านใน */}
      <rect x="5.5" y="5.5" width="189" height="289" rx="13" fill="none" stroke={GOLD} strokeWidth="1.8" />
      <rect x="9.5" y="9.5" width="181" height="281" rx="10" fill="none" stroke={GOLD} strokeWidth="0.7" opacity="0.6" />
      <path d="M17 284V104A83 83 0 0 1 183 104V284" fill="none" stroke={GOLD} strokeWidth="1" opacity="0.75" />
      <Corner />
      <Corner flipX />
      <Corner flipY />
      <Corner flipX flipY />

      {/* ตราบนยอดโค้ง: ดาวในวงทอง มีปีกเล็กสองข้าง */}
      <path d="M84 21C77 16 71 18 66 23C73 22 79 24 84 27M116 21C123 16 129 18 134 23C127 22 121 24 116 27" fill={GOLD} opacity="0.9" />
      <circle cx="100" cy="23" r="10.5" fill="var(--card-deep)" stroke={GOLD} strokeWidth="1.8" />
      <path d={star(100, 23, 7)} fill={CREAM} stroke={AMBER} strokeWidth="1" strokeLinejoin="round" />

      {/* ดาวดวงเล็กและจุดแสงกระจายรอบตัวละคร */}
      <g fill={CREAM} opacity="0.9">
        <circle cx="52" cy="46" r="1.3" />
        <circle cx="150" cy="40" r="1.3" />
        <circle cx="186" cy="150" r="1.3" />
        <circle cx="14" cy="146" r="1.3" />
        <circle cx="160" cy="92" r="1.1" />
        <circle cx="38" cy="100" r="1.1" />
        <circle cx="176" cy="216" r="1.1" />
        <circle cx="24" cy="222" r="1.1" />
        <path d={star(64, 30, 3)} />
        <path d={star(140, 62, 2.6)} />
      </g>
      <Spark x={171} y={62} size={11} delay={0} />
      <Spark x={28} y={70} size={8.5} delay={0.9} />
      <Spark x={181} y={128} size={6.5} delay={1.6} />
      <Spark x={20} y={124} size={5.5} delay={0.4} />
      <Spark x={27} y={186} size={8} delay={1.2} />
      <Spark x={176} y={190} size={5.5} delay={2} />
    </svg>
  )
}

/** ริบบิ้นชื่อใบใหญ่สีครีม ปลายพับสองข้าง วางทับปลายเท้าของตัวละคร และลายเล็กใต้ริบบิ้น */
function CardRibbon() {
  return (
    <svg className="fc-frame" viewBox="0 0 200 300" aria-hidden="true">
      <g stroke="#B5762B" strokeWidth="1.3" strokeLinejoin="round">
        <path d="M27 236L6 240L14 253.5L6 267L33 265Z" fill="#E2B463" />
        <path d="M173 236L194 240L186 253.5L194 267L167 265Z" fill="#E2B463" />
        <path d="M22 233L27 236V248ZM178 233L173 236V248Z" fill="#9A6420" />
        <path d="M22 233Q100 226 178 233V265Q100 258 22 265Z" fill="#FBEBC0" />
      </g>
      <g fill={GOLD}>
        <path d="M100 273.5a3 3 0 0 1 1.9 5.3c1.4 1.2 2.3 3 2.6 5.2h-9c0.3-2.2 1.2-4 2.6-5.2a3 3 0 0 1 1.9-5.3z" />
        <path d="M82 276L85.5 279.5L82 283L78.5 279.5ZM118 276L121.5 279.5L118 283L114.5 279.5Z" />
        <circle cx="70" cy="279.5" r="1.1" />
        <circle cx="130" cy="279.5" r="1.1" />
      </g>
    </svg>
  )
}

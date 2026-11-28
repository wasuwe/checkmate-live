// ตัวละครนิทานแบบตัวเล็กหัวโต (เจ้าของโปรเจกต์กำหนด 2026-11-28 จากภาพอ้างอิง: น่ารัก เส้นขอบหนา ลงสีเรียบ เหมือนสติกเกอร์)
// ใช้เป็นภาพประกอบของชุดหมากรุก: บนการ์ดสะสม ฉากเปิดเกม และห้องรอ ส่วนตัวเบี้ยบนกระดานยังเป็นรูปเดิมใน fables.tsx
// เพราะบนกระดานต้องดูออกว่าเป็นเบี้ยและอ่านง่ายในขนาดเล็ก
//
// วาดในกรอบ 100 × 100 สัตว์ใช้สีตัวหมากของฝั่งนั้น (paint.fill) จึงเห็นว่าเป็นฝ่ายขาวหรือฝ่ายดำ
// ส่วนสิ่งของ (ดวงอาทิตย์ ไข่ทองคำ เนยแข็ง องุ่น) ใช้สีของมันเอง ทุกตัวมีหน้าแบบเดียวกัน: ตาโต แก้มแดง ปากเล็ก

/* oxlint-disable react/only-export-components */

import type { JSX } from 'react'
import type { Color } from './protocol'

export interface HeroPaint {
  fill: string
  ink: string
  color: Color
}

type Draw = (p: HeroPaint) => JSX.Element

const W = 3
const ln = (p: HeroPaint, width = W) =>
  ({ stroke: p.ink, strokeWidth: width, strokeLinejoin: 'round', strokeLinecap: 'round' }) as const
const isLight = (p: HeroPaint) => p.color === 'w'
/** สีของรายละเอียดบนตัว (ตา ปาก เส้นขน): หมึกบนตัวสีอ่อน ครีมบนตัวสีเข้ม */
const feat = (p: HeroPaint) => (isLight(p) ? p.ink : '#FFF3D6')
/** สีในหู ท้อง ปลายหาง */
const soft = (p: HeroPaint) => (isLight(p) ? '#F7CBC1' : 'rgba(255, 255, 255, 0.3)')
/** สีรองของตัว (หน้ากาก ขนอีกสี) */
const second = (p: HeroPaint) => (isLight(p) ? '#EADCC6' : 'rgba(255, 255, 255, 0.18)')
const GOLD = '#F2B94B'
const GOLD_LIGHT = '#FFE08A'

interface FaceOptions {
  x?: number
  gap?: number
  mouth?: 'w' | 'smile' | 'o' | 'none'
  blush?: boolean
  /** คิ้วเฉียง: ตัวร้ายที่ยังน่ารัก */
  brow?: boolean
  scale?: number
  /** บังคับสีรายละเอียด (สำหรับสิ่งของที่มีสีของตัวเอง) */
  ink?: string
}

/** หน้าของตัวละคร: ตาโตมีประกาย แก้มแดง ปากเล็ก */
function face(p: HeroPaint, y: number, options: FaceOptions = {}): JSX.Element {
  const { x = 50, gap = 11, mouth = 'w', blush = true, brow = false, scale = 1, ink } = options
  const dark = !isLight(p) && !ink
  const f = ink ?? feat(p)
  const eye = (cx: number) =>
    dark ? (
      <g key={cx}>
        <ellipse cx={cx} cy={y} rx={3.9 * scale} ry={4.9 * scale} fill="#FFF3D6" />
        <ellipse cx={cx + 0.3} cy={y + 0.8 * scale} rx={2 * scale} ry={2.8 * scale} fill={p.ink} />
        <circle cx={cx - 0.7 * scale} cy={y - 0.9 * scale} r={0.9 * scale} fill="#fff" />
      </g>
    ) : (
      <g key={cx}>
        <ellipse cx={cx} cy={y} rx={3.4 * scale} ry={4.6 * scale} fill={f} />
        <circle cx={cx - 1.1 * scale} cy={y - 1.6 * scale} r={1.4 * scale} fill="#fff" />
      </g>
    )
  const my = y + 7.5 * scale
  return (
    <g>
      {blush && (
        <g fill={dark ? '#FF9E8E' : '#F5A09A'} opacity={dark ? 0.5 : 0.75}>
          <ellipse cx={x - gap - 7 * scale} cy={y + 6 * scale} rx={4.4 * scale} ry={2.7 * scale} />
          <ellipse cx={x + gap + 7 * scale} cy={y + 6 * scale} rx={4.4 * scale} ry={2.7 * scale} />
        </g>
      )}
      {eye(x - gap)}
      {eye(x + gap)}
      {brow && (
        <path
          d={`M${x - gap - 6} ${y - 10.5}L${x - gap + 4.5} ${y - 6.5}M${x + gap + 6} ${y - 10.5}L${x + gap - 4.5} ${y - 6.5}`}
          fill="none"
          stroke={f}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      )}
      {mouth === 'w' && (
        <path d={`M${x - 4.2 * scale} ${my}q${2.1 * scale} ${3 * scale} ${4.2 * scale} 0q${2.1 * scale} ${3 * scale} ${4.2 * scale} 0`} fill="none" stroke={f} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {mouth === 'smile' && <path d={`M${x - 4 * scale} ${my}q${4 * scale} ${4 * scale} ${8 * scale} 0`} fill="none" stroke={f} strokeWidth={2} strokeLinecap="round" />}
      {mouth === 'o' && <ellipse cx={x} cy={my + 1} rx={2.6 * scale} ry={3.1 * scale} fill={f} />}
    </g>
  )
}

/** ตัวเล็กใต้หัว: ลำตัวกลม แขนสั้น เท้าสองข้าง */
function body(p: HeroPaint, options: { y?: number; belly?: boolean; fill?: string } = {}): JSX.Element {
  const { y = 68, belly = true, fill = p.fill } = options
  return (
    <g>
      <ellipse cx="40" cy="94" rx="8" ry="4.5" fill={fill} {...ln(p)} />
      <ellipse cx="60" cy="94" rx="8" ry="4.5" fill={fill} {...ln(p)} />
      <path d={`M35 ${y}C29 ${y + 12} 32 94 50 94C68 94 71 ${y + 12} 65 ${y}Z`} fill={fill} {...ln(p)} />
      {belly && <ellipse cx="50" cy={y + 15} rx="9" ry="9" fill={soft(p)} />}
      <ellipse cx="32" cy={y + 10} rx="5" ry="7" fill={fill} {...ln(p)} transform={`rotate(24 32 ${y + 10})`} />
      <ellipse cx="68" cy={y + 10} rx="5" ry="7" fill={fill} {...ln(p)} transform={`rotate(-24 68 ${y + 10})`} />
    </g>
  )
}

/** ดาวสี่แฉกเล็ก ๆ ใช้เป็นประกายของสิ่งของวิเศษ */
const twinkle = (cx: number, cy: number, s: number, p: HeroPaint) => (
  <path
    d={`M${cx} ${cy - s}Q${cx} ${cy} ${cx + s} ${cy}Q${cx} ${cy} ${cx} ${cy + s}Q${cx} ${cy} ${cx - s} ${cy}Q${cx} ${cy} ${cx} ${cy - s}Z`}
    fill="#FFF8DC"
    {...ln(p, 1.6)}
  />
)

// ---------- สัตว์ ----------

const mouseBase = (p: HeroPaint, hat?: JSX.Element): JSX.Element => (
  <g>
    <path d="M64 88C80 90 86 78 80 70" fill="none" {...ln(p)} />
    {body(p)}
    <circle cx="25" cy="28" r="14" fill={p.fill} {...ln(p)} />
    <circle cx="75" cy="28" r="14" fill={p.fill} {...ln(p)} />
    <circle cx="25" cy="28" r="7.5" fill={soft(p)} />
    <circle cx="75" cy="28" r="7.5" fill={soft(p)} />
    <ellipse cx="50" cy="47" rx="29" ry="25" fill={p.fill} {...ln(p)} />
    {hat}
    {face(p, 47)}
    <ellipse cx="50" cy="51.5" rx="2.2" ry="1.6" fill={isLight(p) ? '#F08C86' : '#FFB0A4'} />
  </g>
)

const mouse: Draw = (p) => mouseBase(p)

const townMouse: Draw = (p) =>
  mouseBase(
    p,
    <g>
      <ellipse cx="50" cy="24" rx="16" ry="4" fill={p.ink} {...ln(p)} />
      <path d="M39 23V9Q50 5 61 9V23Z" fill={p.ink} {...ln(p)} />
      <path d="M39 18H61" stroke={GOLD} strokeWidth="3" />
      <path d="M50 72L41 67V77ZM50 72L59 67V77Z" fill={GOLD} {...ln(p, 2)} />
    </g>,
  )

const countryMouse: Draw = (p) =>
  mouseBase(
    p,
    <g>
      <ellipse cx="50" cy="25" rx="27" ry="6" fill="#E9C46E" {...ln(p)} />
      <path d="M35 24Q36 8 50 8Q64 8 65 24Z" fill="#E9C46E" {...ln(p)} />
      <path d="M35.5 20Q50 25 64.5 20" fill="none" stroke="#B5652B" strokeWidth="3" strokeLinecap="round" />
    </g>,
  )

/** หัวของสุนัขจิ้งจอกและหมาป่า: หูแหลม แก้มเป็นขนฟู */
const canineHead = (p: HeroPaint, fierce: boolean): JSX.Element => (
  <g>
    <path d="M22 34L25 6L45 22Z" fill={p.fill} {...ln(p)} />
    <path d="M78 34L75 6L55 22Z" fill={p.fill} {...ln(p)} />
    <path d="M28 25L29 14L37 21Z" fill={soft(p)} />
    <path d="M72 25L71 14L63 21Z" fill={soft(p)} />
    <path d="M50 20C70 20 81 34 80 47L89 55L78 60C72 70 62 73 50 73C38 73 28 70 22 60L11 55L20 47C19 34 30 20 50 20Z" fill={p.fill} {...ln(p)} />
    <path d="M50 73C40 73 33 68 34 60C35 54 42 51 50 51C58 51 65 54 66 60C67 68 60 73 50 73Z" fill={second(p)} />
    {face(p, 43, { gap: 13, brow: fierce, mouth: 'w' })}
    <path d="M46.5 49.5H53.5L50 53.5Z" fill={feat(p)} stroke={feat(p)} strokeWidth="1.5" strokeLinejoin="round" />
    {fierce && <path d="M43 58L45 62.5L47 58M53 58L55 62.5L57 58" fill="#fff" stroke={p.ink} strokeWidth="1" strokeLinejoin="round" />}
  </g>
)

const fox: Draw = (p) => (
  <g>
    <path d="M62 86C84 92 96 74 86 56C84 68 76 72 66 74Z" fill={p.fill} {...ln(p)} />
    <path d="M86 56C89 62 90 68 88 73C86 68 85 64 84.5 60Z" fill={soft(p)} />
    {body(p)}
    {canineHead(p, false)}
  </g>
)

const wolf: Draw = (p) => (
  <g>
    <path d="M63 86C80 90 90 80 86 64C82 72 76 76 66 76Z" fill={p.fill} {...ln(p)} />
    {body(p)}
    {canineHead(p, true)}
  </g>
)

/** ขนแกะฟู: วงกลมเรียงกันเป็นก้อนเมฆ */
const fluff = (p: HeroPaint, fill: string, points: [number, number, number][]): JSX.Element => (
  <g>
    {points.map(([cx, cy, r], i) => (
      <circle key={i} cx={cx} cy={cy} r={r} fill={fill} {...ln(p)} />
    ))}
    {points.map(([cx, cy, r], i) => (
      <circle key={`in${i}`} cx={cx} cy={cy} r={r - 1.4} fill={fill} />
    ))}
  </g>
)

const WOOL_TOP: [number, number, number][] = [
  [26, 38, 12],
  [34, 24, 12],
  [50, 18, 13],
  [66, 24, 12],
  [74, 38, 12],
]
const WOOL_BODY: [number, number, number][] = [
  [34, 76, 11],
  [66, 76, 11],
  [40, 88, 10],
  [60, 88, 10],
  [50, 78, 13],
]

const sheep: Draw = (p) => {
  const skin = isLight(p) ? '#F3DCC8' : '#6B5A66'
  return (
    <g>
      <ellipse cx="41" cy="95" rx="6" ry="3.5" fill={p.ink} />
      <ellipse cx="59" cy="95" rx="6" ry="3.5" fill={p.ink} />
      {fluff(p, p.fill, WOOL_BODY)}
      <ellipse cx="21" cy="48" rx="9" ry="5.5" fill={skin} {...ln(p)} transform="rotate(-24 21 48)" />
      <ellipse cx="79" cy="48" rx="9" ry="5.5" fill={skin} {...ln(p)} transform="rotate(24 79 48)" />
      <ellipse cx="50" cy="48" rx="24" ry="22" fill={skin} {...ln(p)} />
      {fluff(p, p.fill, WOOL_TOP)}
      {face(p, 50, { gap: 10, ink: isLight(p) ? p.ink : undefined })}
    </g>
  )
}

/** หมาป่าในคราบแกะ: หน้าหมาป่าโผล่จากฮู้ดขนแกะ */
const wolfInFleece: Draw = (p) => (
  <g>
    <ellipse cx="41" cy="95" rx="6" ry="3.5" fill={p.fill} {...ln(p, 2)} />
    <ellipse cx="59" cy="95" rx="6" ry="3.5" fill={p.fill} {...ln(p, 2)} />
    {fluff(p, '#FFF8EC', WOOL_BODY)}
    <path d="M50 24C68 24 78 36 78 48L86 55L76 60C70 70 61 73 50 73C39 73 30 70 24 60L14 55L22 48C22 36 32 24 50 24Z" fill={p.fill} {...ln(p)} />
    <path d="M50 73C40 73 33 68 34 60C35 54 42 51 50 51C58 51 65 54 66 60C67 68 60 73 50 73Z" fill={second(p)} />
    {fluff(p, '#FFF8EC', [
      [22, 40, 12],
      [30, 25, 12],
      [43, 15, 12],
      [57, 15, 12],
      [70, 25, 12],
      [78, 40, 12],
    ])}
    <path d="M30 16L27 3L40 11Z" fill={p.fill} {...ln(p)} />
    <path d="M70 16L73 3L60 11Z" fill={p.fill} {...ln(p)} />
    {face(p, 45, { gap: 12, brow: true })}
    <path d="M46.5 51.5H53.5L50 55.5Z" fill={feat(p)} stroke={feat(p)} strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M43 60L45 64.5L47 60M53 60L55 64.5L57 60" fill="#fff" stroke={p.ink} strokeWidth="1" strokeLinejoin="round" />
  </g>
)

const cat: Draw = (p) => (
  <g>
    <path d="M65 88C84 90 90 72 80 62C78 58 72 60 74 65" fill="none" {...ln(p, 4.5)} />
    {body(p)}
    <path d="M22 36L20 8L44 22Z" fill={p.fill} {...ln(p)} />
    <path d="M78 36L80 8L56 22Z" fill={p.fill} {...ln(p)} />
    <path d="M27 27L26 15L36 21Z" fill={soft(p)} />
    <path d="M73 27L74 15L64 21Z" fill={soft(p)} />
    <ellipse cx="50" cy="46" rx="30" ry="25" fill={p.fill} {...ln(p)} />
    {face(p, 45, { gap: 13 })}
    <path d="M14 46H25M14 53L25 51M86 46H75M86 53L75 51" stroke={feat(p)} strokeWidth="1.6" strokeLinecap="round" />
    <path d="M34 68Q50 76 66 68" fill="none" stroke="#E0566B" strokeWidth="4.5" strokeLinecap="round" />
    <circle cx="50" cy="75" r="5.5" fill={GOLD} {...ln(p, 2)} />
    <path d="M50 75V79" stroke={p.ink} strokeWidth="1.6" strokeLinecap="round" />
  </g>
)

const hare: Draw = (p) => (
  <g>
    <circle cx="70" cy="86" r="7" fill={isLight(p) ? '#FFFFFF' : second(p)} {...ln(p)} />
    {body(p)}
    <ellipse cx="38" cy="19" rx="8" ry="19" fill={p.fill} {...ln(p)} transform="rotate(-9 38 19)" />
    <ellipse cx="62" cy="19" rx="8" ry="19" fill={p.fill} {...ln(p)} transform="rotate(9 62 19)" />
    <ellipse cx="38" cy="20" rx="3.6" ry="12" fill={soft(p)} transform="rotate(-9 38 20)" />
    <ellipse cx="62" cy="20" rx="3.6" ry="12" fill={soft(p)} transform="rotate(9 62 20)" />
    <ellipse cx="50" cy="52" rx="27" ry="22" fill={p.fill} {...ln(p)} />
    {face(p, 50, { gap: 12 })}
    <rect x="47.4" y="60" width="5.2" height="5" rx="1.2" fill="#fff" stroke={p.ink} strokeWidth="1.2" />
  </g>
)

const tortoise: Draw = (p) => {
  const shell = isLight(p) ? '#B9D7B0' : '#5F8F78'
  return (
    <g>
      <ellipse cx="26" cy="92" rx="8" ry="5" fill={p.fill} {...ln(p)} />
      <ellipse cx="74" cy="92" rx="8" ry="5" fill={p.fill} {...ln(p)} />
      <path d="M14 86C14 58 86 58 86 86C86 92 14 92 14 86Z" fill={shell} {...ln(p)} />
      <path d="M32 67L28 88M50 62V90M68 67L72 88M22 78H78" fill="none" stroke={p.ink} strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
      <ellipse cx="50" cy="42" rx="25" ry="22" fill={p.fill} {...ln(p)} />
      {face(p, 42, { gap: 11, mouth: 'smile' })}
    </g>
  )
}

const lion: Draw = (p) => {
  const mane = isLight(p) ? '#E8B36A' : '#D99A4E'
  const points: [number, number, number][] = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    return [50 + Math.cos(a) * 26, 46 + Math.sin(a) * 25, 11]
  })
  return (
    <g>
      <path d="M64 88C80 90 88 80 84 70" fill="none" {...ln(p)} />
      <circle cx="84" cy="68" r="5.5" fill={mane} {...ln(p)} />
      {body(p)}
      {fluff(p, mane, points)}
      <circle cx="33" cy="27" r="7" fill={p.fill} {...ln(p)} />
      <circle cx="67" cy="27" r="7" fill={p.fill} {...ln(p)} />
      <circle cx="50" cy="47" r="22" fill={p.fill} {...ln(p)} />
      {face(p, 46, { gap: 9.5 })}
      <path d="M46.6 52H53.4L50 55.6Z" fill={feat(p)} stroke={feat(p)} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M39 15L42 5L47 11L50 3L53 11L58 5L61 15Z" fill={GOLD_LIGHT} {...ln(p, 2.2)} />
    </g>
  )
}

const crow: Draw = (p) => (
  <g>
    <path d="M30 90L22 97M38 92L34 99M62 92L66 99M70 90L78 97" stroke={GOLD} strokeWidth="3.4" strokeLinecap="round" />
    <path d="M70 78L92 86L72 90Z" fill={p.fill} {...ln(p)} />
    <ellipse cx="50" cy="78" rx="25" ry="17" fill={p.fill} {...ln(p)} />
    <path d="M30 70C22 78 24 90 34 92C32 84 34 76 38 72Z" fill={second(p)} {...ln(p, 2)} />
    <path d="M70 70C78 78 76 90 66 92C68 84 66 76 62 72Z" fill={second(p)} {...ln(p, 2)} />
    <path d="M44 20L47 8L52 17L57 7L59 20Z" fill={p.fill} {...ln(p)} />
    <circle cx="50" cy="42" r="26" fill={p.fill} {...ln(p)} />
    {face(p, 39, { gap: 12, mouth: 'none' })}
    <path d="M41 49L50 45L59 49L50 60Z" fill={GOLD} {...ln(p, 2.2)} />
    <path d="M41 49H59" stroke={p.ink} strokeWidth="1.6" strokeLinecap="round" />
  </g>
)

const goose: Draw = (p) => (
  <g>
    <path d="M40 92L36 99M46 93V99M58 93V99M64 92L68 99" stroke={GOLD} strokeWidth="3.4" strokeLinecap="round" />
    <path d="M74 66L94 60L84 76Z" fill={p.fill} {...ln(p)} />
    <ellipse cx="56" cy="76" rx="28" ry="19" fill={p.fill} {...ln(p)} />
    <path d="M52 70C64 66 76 72 78 82C68 88 56 84 52 70Z" fill={second(p)} {...ln(p, 2)} />
    <path d="M30 78C24 66 26 50 30 40H46C42 52 44 62 50 70Z" fill={p.fill} {...ln(p)} />
    <circle cx="38" cy="30" r="19" fill={p.fill} {...ln(p)} />
    {face(p, 28, { x: 38, gap: 8, mouth: 'none', scale: 0.9 })}
    <path d="M30 35L38 32L46 35L38 44Z" fill={GOLD} {...ln(p, 2.2)} />
  </g>
)

const ant: Draw = (p) => (
  <g>
    <path d="M36 66L18 60M35 72L16 76M38 82L22 92M64 66L82 60M65 72L84 76M62 82L78 92" fill="none" {...ln(p, 2.6)} />
    <ellipse cx="50" cy="84" rx="16" ry="12" fill={p.fill} {...ln(p)} />
    <circle cx="50" cy="66" r="10" fill={p.fill} {...ln(p)} />
    <path d="M40 20C36 10 30 8 26 12M60 20C64 10 70 8 74 12" fill="none" {...ln(p, 2.6)} />
    <circle cx="26" cy="12" r="3" fill={p.fill} {...ln(p, 2)} />
    <circle cx="74" cy="12" r="3" fill={p.fill} {...ln(p, 2)} />
    <ellipse cx="50" cy="38" rx="24" ry="21" fill={p.fill} {...ln(p)} />
    {face(p, 38, { gap: 10 })}
    <ellipse cx="78" cy="48" rx="8" ry="6" fill={GOLD_LIGHT} {...ln(p, 2.2)} transform="rotate(-24 78 48)" />
  </g>
)

const grasshopper: Draw = (p) => {
  const wing = isLight(p) ? '#CFE3A8' : '#8FB26A'
  return (
    <g>
      <path d="M40 76L14 56L12 92M60 76L86 56L88 92" fill="none" {...ln(p, 3.4)} />
      <path d="M40 84L30 96M60 84L70 96" fill="none" {...ln(p, 2.6)} />
      <ellipse cx="50" cy="76" rx="14" ry="20" fill={p.fill} {...ln(p)} />
      <path d="M50 58C60 64 62 84 52 94C46 84 44 68 50 58Z" fill={wing} {...ln(p, 2)} />
      <path d="M40 22C34 8 24 4 16 8M60 22C66 8 76 4 84 8" fill="none" {...ln(p, 2.4)} />
      <ellipse cx="50" cy="38" rx="23" ry="20" fill={p.fill} {...ln(p)} />
      {face(p, 38, { gap: 10, mouth: 'smile' })}
    </g>
  )
}

// ---------- สิ่งของและธรรมชาติ ----------

const sun: Draw = (p) => {
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2
    const b = a + Math.PI / 12
    const c = a - Math.PI / 12
    const pt = (r: number, t: number) => `${(50 + Math.cos(t) * r).toFixed(1)} ${(50 + Math.sin(t) * r).toFixed(1)}`
    return `M${pt(30, c)}L${pt(i % 2 ? 41 : 46, a)}L${pt(30, b)}Z`
  }).join('')
  return (
    <g>
      <path d={rays} fill={GOLD} {...ln(p, 2.4)} />
      <circle cx="50" cy="50" r="29" fill={GOLD_LIGHT} {...ln(p)} />
      {face(p, 48, { gap: 11, ink: p.ink, mouth: 'smile' })}
    </g>
  )
}

const wind: Draw = (p) => (
  <g>
    <path d="M78 62C88 58 96 64 92 72C90 77 84 76 84 72M80 72C86 76 84 86 76 84" fill="none" stroke={isLight(p) ? p.ink : p.fill} strokeWidth="3" strokeLinecap="round" />
    <path
      d="M20 72C8 72 4 58 14 50C10 36 24 26 36 32C40 18 62 16 68 30C82 26 92 40 84 52C90 62 82 74 70 72Z"
      fill={p.fill}
      {...ln(p)}
    />
    <path d="M22 44C24 38 30 36 34 38M46 28C50 24 58 24 62 28" fill="none" stroke={feat(p)} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    {face(p, 50, { x: 46, gap: 12, mouth: 'o' })}
    <path d="M30 80C36 86 46 86 50 80M56 82C60 86 66 86 70 82" fill="none" stroke={isLight(p) ? p.ink : p.fill} strokeWidth="2.6" strokeLinecap="round" opacity="0.8" />
  </g>
)

const pitcher: Draw = (p) => (
  <g>
    <path d="M68 46C88 44 90 76 70 78" fill="none" {...ln(p, 4)} />
    <path d="M33 24H64L61 38C76 48 80 80 64 94H36C20 80 24 48 39 38L36 30L28 26Z" fill={p.fill} {...ln(p)} />
    <path d="M38.5 38H61.5" stroke={p.ink} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
    <path d="M29 62C33 58 37 66 41 62C45 58 49 66 53 62C57 58 61 66 65 62C69 58 71 62 71 62C72 76 68 86 62 91H38C31 86 27 74 29 62Z" fill={isLight(p) ? '#A9D2F0' : '#6FA3D6'} opacity="0.85" />
    {face(p, 70, { gap: 10, ink: p.ink })}
    <ellipse cx="18" cy="92" rx="6" ry="4" fill="#B9C0C8" {...ln(p, 2)} />
    <ellipse cx="84" cy="94" rx="5" ry="3.4" fill="#B9C0C8" {...ln(p, 2)} />
  </g>
)

const grapes: Draw = (p) => {
  const berry = isLight(p) ? '#D8C1EC' : '#8E5FB0'
  const spots: [number, number][] = [
    [32, 44],
    [50, 42],
    [68, 44],
    [41, 60],
    [59, 60],
    [50, 77],
  ]
  return (
    <g>
      <path d="M50 28V14" fill="none" {...ln(p, 3.4)} />
      <path d="M50 20C58 8 74 10 78 22C68 28 56 28 50 20Z" fill="#8DB56F" {...ln(p)} />
      <path d="M54 20L72 20" stroke={p.ink} strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
      {spots.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="13.5" fill={berry} {...ln(p)} />
      ))}
      {spots.map(([cx, cy], i) => (
        <ellipse key={`s${i}`} cx={cx - 5} cy={cy - 6} rx="3" ry="2" fill="#fff" opacity="0.7" transform={`rotate(-30 ${cx - 5} ${cy - 6})`} />
      ))}
      {face(p, 55, { gap: 10, ink: p.ink })}
    </g>
  )
}

const goldenEgg: Draw = (p) => (
  <g>
    <ellipse cx="50" cy="93" rx="22" ry="4" fill={p.ink} opacity="0.18" />
    <path d="M50 12C68 12 80 40 80 60C80 80 66 92 50 92C34 92 20 80 20 60C20 40 32 12 50 12Z" fill={GOLD_LIGHT} {...ln(p)} />
    <path d="M32 40C34 28 40 20 46 18" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
    {face(p, 58, { gap: 11, ink: p.ink, mouth: 'smile' })}
    {twinkle(84, 26, 8, p)}
    {twinkle(14, 44, 5.5, p)}
  </g>
)

const cheese: Draw = (p) => (
  <g>
    <path d="M12 84V58L58 26C78 32 88 48 88 60V84Z" fill={GOLD_LIGHT} {...ln(p)} />
    <path d="M12 58L58 26C78 32 88 48 88 60Z" fill="#FFEFB5" {...ln(p)} />
    <circle cx="26" cy="74" r="4.5" fill="#E9B94F" />
    <circle cx="76" cy="76" r="3.6" fill="#E9B94F" />
    <ellipse cx="54" cy="44" rx="6" ry="3.6" fill="#E9B94F" transform="rotate(-12 54 44)" />
    <ellipse cx="72" cy="50" rx="3.4" ry="2.2" fill="#E9B94F" />
    {face(p, 70, { gap: 11, ink: p.ink })}
  </g>
)

/** ตัวละครของแต่ละชุด: [ฝ่ายขาว, ฝ่ายดำ] ลำดับเดียวกับ FABLE_FIGURES และ FABLE_CAST ใน fables.tsx */
const HEROES: Record<string, [Draw, Draw]> = {
  sky: [sun, wind],
  soda: [pitcher, crow],
  mint: [tortoise, hare],
  matcha: [sheep, wolf],
  grape: [grapes, fox],
  lavender: [mouse, cat],
  honey: [goldenEgg, goose],
  lemon: [ant, grasshopper],
  cocoa: [mouse, lion],
  classic: [townMouse, countryMouse],
  sakura: [cheese, fox],
  strawberry: [sheep, wolfInFleece],
}

export const HERO_SET_IDS = Object.keys(HEROES)

/** เนื้อภาพของตัวละคร (ใช้ในกรอบ viewBox 0 0 100 100) หรือ undefined ถ้าชุดนี้ไม่มีตัวละคร */
export function heroFigure(setId: string, paint: HeroPaint): JSX.Element | undefined {
  const pair = HEROES[setId]
  return pair ? pair[paint.color === 'w' ? 0 : 1](paint) : undefined
}

// กิมมิกของชุดหมากรุกนิทานอีสป: ลายบนช่องกระดานและตัวละครของเรื่องเป็นตัวเบี้ย
// ฝั่งขาวกับฝั่งดำเป็นตัวละครคนละตัวในเรื่องเดียวกัน (เช่น เต่ากับกระต่าย) ตัวหมากอื่นยังเป็นรูปหมากรุกปกติ
// วาดในกรอบ 45×45 ตัวละครสีตามสีตัวหมากของชุด (paint.fill) มีสีประจำตัวเล็กน้อยเป็นจุดเด่น

/* oxlint-disable react/only-export-components */

import type { JSX } from 'react'
import type { Color } from './protocol'

export interface FablePaint {
  fill: string
  ink: string
  color: Color
}

type Draw = (p: FablePaint) => JSX.Element

const line = (ink: string, width = 1.3) => ({
  stroke: ink,
  strokeWidth: width,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
})

/** ฐานของตัวเบี้ย ทุกตัวละครยืนบนฐานนี้ จึงยังดูออกว่าเป็นเบี้ย */
const base = ({ fill, ink }: FablePaint) => (
  <path d="M11.5 39.5 Q11.5 36.2 14.5 35.6 H30.5 Q33.5 36.2 33.5 39.5 Z" fill={fill} {...line(ink)} />
)

/** สีรองของตัวละคร: อ่อนกว่าหรือเข้มกว่าสีตัวหมากเล็กน้อย ใช้แทนสีสดหลายสี ให้ทั้งชุดดูเป็นชุดเดียวกัน */
const tone = (p: FablePaint) => (p.color === 'w' ? '#DCCFB6' : 'rgba(255, 255, 255, 0.3)')
const GOLD_DEEP = '#C9A45C'

const eyes = (y: number, gap: number, color: string, r = 1.3) => (
  <>
    <circle cx={22.5 - gap} cy={y} r={r} fill={color} />
    <circle cx={22.5 + gap} cy={y} r={r} fill={color} />
  </>
)

/** สีตาที่อ่านออกบนตัวละครสีอ่อนหรือสีเข้ม */
const eyeOn = (p: FablePaint) => (p.color === 'w' ? p.ink : '#FFF6DC')

// ---------- ตัวละคร ----------

const sun: Draw = (p) => (
  <g>
    {Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4
      return (
        <line
          key={i}
          x1={22.5 + Math.cos(a) * 11.5}
          y1={21 + Math.sin(a) * 11.5}
          x2={22.5 + Math.cos(a) * 15}
          y2={21 + Math.sin(a) * 15}
          {...line('#C9973A', 2.2)}
        />
      )
    })}
    <circle cx="22.5" cy="21" r="9.5" fill="#FFE9A8" {...line(p.ink)} />
    <circle cx="22.5" cy="21" r="5.6" fill="none" {...line('#C9973A', 1)} />
  </g>
)

const wind: Draw = (p) => (
  <g>
    <path
      d="M12.5 31 Q8.5 31 9 26.5 Q9.5 22.5 14 22.5 Q14.5 14.5 22.5 14 Q30.5 14.5 31.5 21.5 Q36 21.5 36 26.5 Q36 31 32 31 Z"
      fill={p.fill}
      {...line(p.ink)}
    />
    <path d="M14 27.5 Q19 24 23.5 27 T32.5 25.5" fill="none" {...line('#E6E8F7', 1.5)} />
    <path d="M3 18 H9 M2 24 H7" {...line(p.ink, 1.3)} />
  </g>
)

const pitcher: Draw = (p) => (
  <g>
    <path d="M28.5 19 Q35 20 31 28" fill="none" {...line(p.ink, 2)} />
    <path d="M16 34 Q13.5 24.5 18 18.5 L17 12 H28 L27 18.5 Q31.5 24.5 29 34 Z" fill={p.fill} {...line(p.ink)} />
    <path d="M15.6 25 H29.4" {...line(tone(p), 2)} />
    <circle cx="20" cy="30" r="1.6" fill={tone(p)} />
    <circle cx="24.5" cy="31" r="1.4" fill={tone(p)} />
    <circle cx="22" cy="27.6" r="1.2" fill={tone(p)} />
  </g>
)

const crow: Draw = (p) => (
  <g>
    <path d="M13 27 L7.5 31.5 L14 31.5 Z" fill={p.fill} {...line(p.ink)} />
    <ellipse cx="21" cy="26" rx="9" ry="8" fill={p.fill} {...line(p.ink)} />
    <circle cx="25.5" cy="15.5" r="6" fill={p.fill} {...line(p.ink)} />
    <path d="M30.8 14 L37 16.2 L30.8 18.4 Z" fill="#D8B56C" {...line(p.ink, 1.2)} />
    <circle cx="26.8" cy="14" r="1.9" fill="#FFF6DC" />
    <circle cx="27.2" cy="14" r="0.9" fill={p.ink} />
    <path d="M15 24.5 Q20.5 21 26.5 26.5" fill="none" {...line(p.color === 'w' ? '#9AA4AE' : '#5A6378', 1.4)} />
  </g>
)

const tortoise: Draw = (p) => (
  <g>
    <circle cx="35.5" cy="27.5" r="3.6" fill={tone(p)} {...line(p.ink, 1.3)} />
    <rect x="14" y="30" width="4" height="5" rx="1.5" fill={tone(p)} {...line(p.ink, 1.2)} />
    <rect x="27" y="30" width="4" height="5" rx="1.5" fill={tone(p)} {...line(p.ink, 1.2)} />
    <path d="M10.5 32 Q11.5 16.5 22.5 15.5 Q33.5 16.5 34.5 32 Z" fill={p.fill} {...line(p.ink)} />
    <path d="M16.5 32 L18.8 24 H26.2 L28.5 32 M18.8 24 L22.5 17.5 L26.2 24" fill="none" {...line(tone(p), 1.2)} />
  </g>
)

const hare: Draw = (p) => (
  <g>
    <ellipse cx="18.2" cy="11" rx="3.2" ry="8.5" transform="rotate(-12 18.2 11)" fill={p.fill} {...line(p.ink)} />
    <ellipse cx="26.8" cy="11" rx="3.2" ry="8.5" transform="rotate(12 26.8 11)" fill={p.fill} {...line(p.ink)} />
    <path d="M18.2 6 V15 M26.8 6 V15" {...line(tone(p), 1.5)} />
    <circle cx="22.5" cy="25" r="8.5" fill={p.fill} {...line(p.ink)} />
    {eyes(23.5, 3.4, eyeOn(p))}
    <circle cx="22.5" cy="27" r="1.3" fill={tone(p)} />
  </g>
)

/** ขนแกะเป็นปุยกลมหลายก้อน (ไม่มีเส้นซ้อนข้างใน) */
const fleece = (fill: string, ink: string) => {
  const puffs = [
    [15.5, 27, 6],
    [22.5, 22.5, 7],
    [29.5, 27, 6],
    [18.5, 31, 5],
    [26.5, 31, 5],
  ]
  return (
    <>
      {puffs.map(([x, y, r], i) => (
        <circle key={`o${i}`} cx={x} cy={y} r={r} fill={fill} {...line(ink)} />
      ))}
      {puffs.map(([x, y, r], i) => (
        <circle key={`i${i}`} cx={x} cy={y} r={r - 0.9} fill={fill} />
      ))}
    </>
  )
}

const sheep: Draw = (p) => (
  <g>
    {fleece(p.fill, p.ink)}
    <ellipse cx="22.5" cy="20.5" rx="4.8" ry="6" fill={p.ink} {...line(p.ink, 1.2)} />
    <path d="M17.5 17 L14.5 19 M27.5 17 L30.5 19" {...line(p.ink, 2.4)} />
    {eyes(19.5, 2, '#FFF6DC', 1)}
  </g>
)

const wolfHead = (p: FablePaint, y = 0) => (
  <g transform={`translate(0 ${y})`}>
    <path d="M13 8 L17.5 18 L11 18.5 Z" fill={p.fill} {...line(p.ink)} />
    <path d="M32 8 L34 18.5 L27.5 18 Z" fill={p.fill} {...line(p.ink)} />
    <circle cx="22.5" cy="22" r="9" fill={p.fill} {...line(p.ink)} />
    <ellipse cx="22.5" cy="27" rx="5" ry="3.8" fill={tone(p)} {...line(p.ink, 1.2)} />
    <circle cx="22.5" cy="25.2" r="1.5" fill={p.ink} />
    <path d="M17 20 L20.5 21 M28 20 L24.5 21" {...line('#F2CF6E', 1.8)} />
  </g>
)

const wolf: Draw = (p) => (
  <g>
    {wolfHead(p)}
  </g>
)

/** หมาป่าในคราบแกะ: ขนแกะทั้งตัว แต่หูแหลมกับตาสีทองโผล่ออกมา */
const wolfInFleece: Draw = (p) => (
  <g>
    <path d="M14 10 L18 19 L12.5 19 Z" fill={p.fill} {...line(p.ink)} />
    <path d="M31 10 L32.5 19 L27 19 Z" fill={p.fill} {...line(p.ink)} />
    {fleece('#F3EDE2', p.ink)}
    <ellipse cx="22.5" cy="21" rx="5.4" ry="6" fill={p.fill} {...line(p.ink, 1.2)} />
    <path d="M18.8 19.5 L21.3 20.4 M26.2 19.5 L23.7 20.4" {...line('#F2CF6E', 1.6)} />
    <path d="M20 25 L21.2 23.8 L22.5 25 L23.8 23.8 L25 25" fill="none" {...line('#FFF6DC', 1)} />
  </g>
)

const grapes: Draw = (p) => {
  const berry = p.fill
  return (
    <g>
      <path d="M22.5 13 Q23.5 9 27 7.5" fill="none" {...line(p.ink, 1.4)} />
      <path d="M25 9.5 Q31 6 33 11 Q28 13.5 25 9.5 Z" fill={tone(p)} {...line(p.ink, 1.1)} />
      {[
        [17, 17],
        [22.5, 17],
        [28, 17],
        [19.7, 22.6],
        [25.3, 22.6],
        [22.5, 28.2],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.7" fill={berry} {...line(p.ink, 1.2)} />
      ))}
      </g>
  )
}

const fox: Draw = (p) => (
  <g>
    <path d="M11 14 L13 5.5 L19 14.5 Z" fill={p.fill} {...line(p.ink)} />
    <path d="M34 14 L32 5.5 L26 14.5 Z" fill={p.fill} {...line(p.ink)} />
    <path d="M13.5 12.5 L14.3 8.5 L16.8 12.8 M31.5 12.5 L30.7 8.5 L28.2 12.8" fill="none" {...line(tone(p), 1.4)} />
    <path d="M10.5 14 Q22.5 9.5 34.5 14 Q33 25 22.5 33.5 Q12 25 10.5 14 Z" fill={p.fill} {...line(p.ink)} />
    <path d="M16 22 Q22.5 25.5 29 22 Q26 29 22.5 33 Q19 29 16 22 Z" fill="#FFF6DC" {...line(p.ink, 1)} />
    <circle cx="22.5" cy="31.5" r="1.5" fill={p.ink} />
    <path d="M16.8 18.5 L20 19.5 M28.2 18.5 L25 19.5" {...line('#F2CF6E', 1.8)} />
  </g>
)

const mouseHead = (p: FablePaint) => (
  <g>
    <circle cx="14.5" cy="16" r="5.5" fill={p.fill} {...line(p.ink)} />
    <circle cx="30.5" cy="16" r="5.5" fill={p.fill} {...line(p.ink)} />
    <circle cx="14.5" cy="16" r="3" fill={tone(p)} />
    <circle cx="30.5" cy="16" r="3" fill={tone(p)} />
    <circle cx="22.5" cy="25" r="8.5" fill={p.fill} {...line(p.ink)} />
    {eyes(24, 3.2, eyeOn(p))}
    <circle cx="22.5" cy="28" r="1.4" fill={tone(p)} />
  </g>
)

const mouse: Draw = (p) => (
  <g>
    {mouseHead(p)}
  </g>
)

/** หนูเมือง: หมวกทรงสูงแบบคนเมือง */
const townMouse: Draw = (p) => (
  <g>
    {mouseHead(p)}
    <rect x="16" y="15" width="13" height="2.2" rx="1" fill="#2B2A33" />
    <rect x="18.2" y="6.5" width="8.6" height="9" rx="1" fill="#2B2A33" />
    <rect x="18.2" y="12.5" width="8.6" height="1.6" fill={GOLD_DEEP} />
  </g>
)

/** หนูบ้านนอก: หมวกฟาง */
const countryMouse: Draw = (p) => (
  <g>
    {mouseHead(p)}
    <ellipse cx="22.5" cy="16" rx="10" ry="2.6" fill="#E2C98C" {...line(p.ink, 1.1)} />
    <path d="M17 16 Q17.5 9.5 22.5 9.5 Q27.5 9.5 28 16" fill="#E2C98C" {...line(p.ink, 1.1)} />
    <path d="M17.2 14 H27.8" {...line(tone(p), 1.4)} />
  </g>
)

const catWithBell: Draw = (p) => (
  <g>
    <path d="M13.5 19 L14.5 7.5 L21 15 Z" fill={p.fill} {...line(p.ink)} />
    <path d="M31.5 19 L30.5 7.5 L24 15 Z" fill={p.fill} {...line(p.ink)} />
    <circle cx="22.5" cy="23" r="9" fill={p.fill} {...line(p.ink)} />
    <path d="M18 21.5 Q19.2 20.5 20.4 21.5 M24.6 21.5 Q25.8 20.5 27 21.5" fill="none" {...line('#F2CF6E', 1.6)} />
    <path d="M21.3 25.5 L22.5 26.7 L23.7 25.5" fill="none" {...line(tone(p), 1.2)} />
    <path d="M15.5 31 Q22.5 34 29.5 31" fill="none" {...line(GOLD_DEEP, 2)} />
    <circle cx="22.5" cy="33.2" r="2.6" fill="#F2CF6E" {...line(p.ink, 1)} />
  </g>
)

const goldenEgg: Draw = (p) => (
  <g>
    <ellipse cx="22.5" cy="23" rx="8.3" ry="10.8" fill="#F2CF6E" {...line(p.ink)} />
    <ellipse cx="19.5" cy="18.5" rx="2.2" ry="3.6" fill="#FFF6DC" opacity="0.8" />
    <path d="M30 9 Q30.6 12 33.5 12.5 Q30.6 13 30 16 Q29.4 13 26.5 12.5 Q29.4 12 30 9 Z" fill="#FFE9A8" {...line('#C9973A', 0.8)} />
  </g>
)

const goose: Draw = (p) => (
  <g>
    <ellipse cx="25.5" cy="29" rx="9" ry="5.8" fill={p.fill} {...line(p.ink)} />
    <path d="M19.5 28 Q14 21 17.5 12.5" fill="none" {...line(p.ink, 6.4)} />
    <path d="M19.5 28 Q14 21 17.5 12.5" fill="none" stroke={p.fill} strokeWidth="3.6" strokeLinecap="round" />
    <circle cx="18" cy="11.5" r="4.3" fill={p.fill} {...line(p.ink)} />
    <path d="M14 10.5 L8.5 12.2 L14 14 Z" fill={GOLD_DEEP} {...line(p.ink, 1)} />
    <circle cx="18.6" cy="10.6" r="1" fill="#FFF6DC" />
    <path d="M24 27 Q28.5 25 32 28" fill="none" {...line('#F2CF6E', 1.3)} />
  </g>
)

const ant: Draw = (p) => (
  <g>
    <path d="M13 17 Q10 11 7.5 10 M16 16.5 Q16 10 13.5 8" fill="none" {...line(p.ink, 1.1)} />
    <path d="M18 26 L14 33 M22 26 L22 33.5 M26 26 L30 33" {...line(p.ink, 1.3)} />
    <circle cx="15" cy="20.5" r="4" fill={p.fill} {...line(p.ink)} />
    <ellipse cx="22" cy="24" rx="3.3" ry="2.8" fill={p.fill} {...line(p.ink)} />
    <ellipse cx="30" cy="26" rx="5.5" ry="4.5" fill={p.fill} {...line(p.ink)} />
    <circle cx="14" cy="19.5" r="0.9" fill={eyeOn(p)} />
    <path d="M10 25 L13.5 29 Q15 30.5 17 29" fill="none" {...line(GOLD_DEEP, 1)} />
  </g>
)

const grasshopper: Draw = (p) => (
  <g>
    <path d="M32 17 Q36 10 39 9.5 M30 16 Q32 9 34.5 7" fill="none" {...line(p.ink, 1.1)} />
    <path d="M16 27 L23 14 L28 26" fill="none" {...line(p.ink, 3.8)} />
    <path d="M16 27 L23 14 L28 26" fill="none" stroke={tone(p)} strokeWidth="2" strokeLinejoin="round" />
    <ellipse cx="21" cy="27" rx="11" ry="4.3" transform="rotate(-12 21 27)" fill={p.fill} {...line(p.ink)} />
    <circle cx="31.5" cy="21" r="4.2" fill={p.fill} {...line(p.ink)} />
    <circle cx="33" cy="20.3" r="1.1" fill={eyeOn(p)} />
    <path d="M13 31 L11 34 M19 31.5 L18 34.5" {...line(p.ink, 1.3)} />
  </g>
)

const lion: Draw = (p) => (
  <g>
    {Array.from({ length: 12 }, (_, i) => {
      const a = (i * Math.PI) / 6
      return <circle key={i} cx={22.5 + Math.cos(a) * 9.5} cy={22 + Math.sin(a) * 9.5} r="4.3" fill={p.fill} {...line(p.ink, 1.3)} />
    })}
    <circle cx="22.5" cy="22" r="9.3" fill={p.fill} />
    <circle cx="22.5" cy="22.5" r="7" fill="#E8C98E" {...line(p.ink, 1.3)} />
    {eyes(21, 2.6, p.ink, 1.1)}
    <path d="M21 24.2 L22.5 25.6 L24 24.2 Z" fill={p.ink} />
    <path d="M20.3 27 Q22.5 28.5 24.7 27" fill="none" {...line(p.ink, 1)} />
  </g>
)

const cheese: Draw = (p) => (
  <g>
    <path d="M10.5 32 L34.5 32 L34.5 21 L10.5 32 Z" fill="#F2CF6E" {...line(p.ink)} />
    <path d="M10.5 32 L34.5 21 L28 13.5 Z" fill="#FBE29A" {...line(p.ink)} />
    <circle cx="28" cy="27.5" r="1.8" fill="#D8A73E" />
    <circle cx="22.5" cy="29.5" r="1.2" fill="#D8A73E" />
    <circle cx="25" cy="20" r="1.3" fill="#D8A73E" />
  </g>
)

/** ตัวละครของแต่ละชุด: [ฝั่งขาว, ฝั่งดำ] วาดเฉพาะตัว ไม่มีฐาน */
const FABLE_FIGURES: Record<string, [Draw, Draw]> = {
  sky: [sun, wind],
  soda: [pitcher, crow],
  mint: [tortoise, hare],
  matcha: [sheep, wolf],
  grape: [grapes, fox],
  lavender: [mouse, catWithBell],
  honey: [goldenEgg, goose],
  lemon: [ant, grasshopper],
  cocoa: [mouse, lion],
  classic: [townMouse, countryMouse],
  sakura: [cheese, fox],
  strawberry: [sheep, wolfInFleece],
}

// ---------- ตัวหมากทุกตัวเป็นตัวละครของฝั่งนั้น แต่งชุดตามตำแหน่ง ----------
// เบี้ย: ตัวละครยืนบนฐาน · คิง: เสื้อคลุมกับมงกุฎ · ควีน: ชุดกระโปรงกับมงกุฎเล็ก
// เรือ: ยืนบนป้อม · บิชอป: เสื้อยาวกับหมวกทรงสูง · ม้า: โล่กับหอก
// ป้ายเล็กที่มุมตัวหมาก (มาจาก pieceSets) ยังบอกชนิดหมากเสมอ

const GOLD = '#F2CF6E'

/** ฐานกว้างของตัวหมากที่ไม่ใช่เบี้ย */
const wideBase = ({ fill, ink }: FablePaint) => <rect x="9.5" y="36" width="26" height="5" rx="2.5" fill={fill} {...line(ink)} />

/** ตัวละครย่อขนาดแล้ววางให้จุดกลางตัวอยู่ที่ (x, y) */
const figureAt = (figure: Draw, p: FablePaint, x: number, y: number, scale: number) => (
  <g transform={`translate(${x} ${y}) scale(${scale}) translate(-22.5 -22)`}>{figure(p)}</g>
)

type Role = (figure: Draw, p: FablePaint) => JSX.Element

const pawnRole: Role = (figure, p) => (
  <g>
    {figure(p)}
    {base(p)}
  </g>
)

const kingRole: Role = (figure, p) => (
  <g>
    <path d="M11 37 Q12 25.5 22.5 23.5 Q33 25.5 34 37 Z" fill={p.fill} {...line(p.ink)} />
    <path d="M22.5 24 V36.5" {...line(GOLD, 1.6)} />
    {figureAt(figure, p, 22.5, 17, 0.6)}
    <path d="M14.5 9.5 L15.5 3 L19.3 6.6 L22.5 1.8 L25.7 6.6 L29.5 3 L30.5 9.5 Z" fill={GOLD} {...line(p.ink, 1.3)} />
    {wideBase(p)}
  </g>
)

const queenRole: Role = (figure, p) => (
  <g>
    <path d="M9.5 37 Q15 30 16.5 24.5 H28.5 Q30 30 35.5 37 Z" fill={p.fill} {...line(p.ink)} />
    <path d="M13.5 33 Q22.5 30 31.5 33" fill="none" {...line(GOLD, 1.4)} />
    {figureAt(figure, p, 22.5, 17, 0.6)}
    <path d="M15.5 8.5 Q22.5 2 29.5 8.5 L28 10 Q22.5 5.5 17 10 Z" fill={GOLD} {...line(p.ink, 1.2)} />
    <circle cx="22.5" cy="4.6" r="1.9" fill={GOLD_DEEP} {...line(p.ink, 1)} />
    {wideBase(p)}
  </g>
)

const rookRole: Role = (figure, p) => (
  <g>
    {figureAt(figure, p, 22.5, 12.5, 0.55)}
    <path
      d="M11.5 37 V23 H15 V20 H19 V23 H21 V20 H24 V23 H26 V20 H30 V23 H33.5 V37 Z"
      fill={p.fill}
      {...line(p.ink)}
    />
    <path d="M19.5 37 V31 Q22.5 27.5 25.5 31 V37" fill="none" {...line(p.ink, 1.3)} />
    <path d="M12 26.5 H33" {...line(GOLD, 1.3)} />
    {wideBase(p)}
  </g>
)

const bishopRole: Role = (figure, p) => (
  <g>
    <path d="M14 37 Q15 26 22.5 24 Q30 26 31 37 Z" fill={p.fill} {...line(p.ink)} />
    <path d="M22.5 25 V36.5 M19 30 H26" {...line(GOLD, 1.5)} />
    {figureAt(figure, p, 22.5, 17.5, 0.58)}
    <path d="M17.5 10 Q18.5 3.5 22.5 0.8 Q26.5 3.5 27.5 10 Z" fill={GOLD} {...line(p.ink, 1.2)} />
    <path d="M22.5 3 V9" {...line(p.ink, 1)} />
    {wideBase(p)}
  </g>
)

const knightRole: Role = (figure, p) => (
  <g>
    <path d="M6 5 L19 30" {...line(p.ink, 2.4)} />
    <path d="M6 5 L19 30" stroke={GOLD} strokeWidth="1" strokeLinecap="round" />
    <path d="M13 37 Q14 27 21 25 Q28 27 29 37 Z" fill={p.fill} {...line(p.ink)} />
    {figureAt(figure, p, 21, 18, 0.58)}
    <path d="M28 22 H38 V29 Q38 34.5 33 36.5 Q28 34.5 28 29 Z" fill={GOLD} {...line(p.ink, 1.3)} />
    <path d="M30.5 26 L33 30.5 L35.5 26" fill="none" {...line(p.ink, 1.2)} />
    {wideBase(p)}
  </g>
)

const ROLES: Record<'K' | 'Q' | 'R' | 'B' | 'N' | 'P', Role> = {
  K: kingRole,
  Q: queenRole,
  R: rookRole,
  B: bishopRole,
  N: knightRole,
  P: pawnRole,
}

/** ตัวหมากของชุดนิทาน หรือ undefined ถ้าชุดนั้นไม่มีตัวละคร */
export function fablePiece(setId: string, kind: 'K' | 'Q' | 'R' | 'B' | 'N' | 'P', paint: FablePaint): JSX.Element | undefined {
  const cast = FABLE_FIGURES[setId]
  if (!cast) return undefined
  return ROLES[kind](cast[paint.color === 'w' ? 0 : 1], paint)
}

/** ชุดที่มีตัวละครครบ (ใช้ตรวจในเทส) */
export const FABLE_SET_IDS = Object.keys(FABLE_FIGURES)

/** ชื่อตัวละครที่เป็นเบี้ยของแต่ละชุด ใช้บอกในหน้าเลือกชุด */
export const FABLE_CAST: Record<string, [string, string]> = {
  sky: ['ดวงอาทิตย์', 'ลมเหนือ'],
  soda: ['เหยือกน้ำ', 'อีกา'],
  mint: ['เต่า', 'กระต่าย'],
  matcha: ['แกะ', 'หมาป่า'],
  grape: ['องุ่น', 'สุนัขจิ้งจอก'],
  lavender: ['หนู', 'แมวผูกกระดิ่ง'],
  honey: ['ไข่ทองคำ', 'ห่าน'],
  lemon: ['มด', 'ตั๊กแตน'],
  cocoa: ['หนู', 'ราชสีห์'],
  classic: ['หนูเมือง', 'หนูบ้านนอก'],
  sakura: ['ก้อนเนยแข็ง', 'สุนัขจิ้งจอก'],
  strawberry: ['แกะ', 'หมาป่าในคราบแกะ'],
}

// ---------- ลายบนช่องกระดาน ----------

/** ลายหนึ่งช่องเป็นภาพ SVG (กรอบ 100×100) วางทับสีช่อง ใช้สีจาง ๆ ให้หมากยังเด่น */
function tile(inner: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>${inner}</svg>`)}")`
}

// ลายต้องจางมาก: เป็นแค่พื้นผิวของช่อง ไม่แย่งสายตาจากตัวหมาก
const FAINT = 0.5
const S = (color: string, opacity: number, width = 3) =>
  `fill='none' stroke='${color}' stroke-opacity='${(opacity * FAINT).toFixed(2)}' stroke-width='${width * 0.8}' stroke-linecap='round' stroke-linejoin='round'`
const F = (color: string, opacity: number) => `fill='${color}' fill-opacity='${(opacity * FAINT).toFixed(2)}'`

const sunRays = `<circle cx='80' cy='20' r='8' ${F('#C9973A', 0.28)}/><path d='M80 4v6M80 30v6M64 20h6M90 20h6M69 9l4 4M87 27l4 4M91 9l-4 4M73 27l-4 4' ${S('#C9973A', 0.3)}/>`
const windSwirl = `<path d='M8 58 Q28 38 48 54 T88 50' ${S('#FFFFFF', 0.45)}/><path d='M22 76 Q40 62 58 72 Q70 78 76 68' ${S('#FFFFFF', 0.35)}/>`
const pebbles = `<ellipse cx='26' cy='72' rx='9' ry='6' ${F('#7E8994', 0.22)}/><ellipse cx='62' cy='82' rx='6' ry='4' ${F('#7E8994', 0.22)}/><ellipse cx='76' cy='30' rx='5' ry='3.5' ${F('#7E8994', 0.22)}/>`
const ripples = `<path d='M14 40 Q50 24 86 40' ${S('#FFFFFF', 0.38)}/><path d='M26 60 Q50 48 74 60' ${S('#FFFFFF', 0.3)}/><path d='M38 78 Q50 72 62 78' ${S('#FFFFFF', 0.25)}/>`
const grass = `<path d='M22 88 Q20 76 14 70 M24 88 Q24 74 26 66 M27 88 Q30 78 36 74 M70 44 Q69 36 65 32 M72 44 Q73 35 77 31' ${S('#4F7A5C', 0.32, 2.4)}/>`
const clover = `<g ${F('#FFFFFF', 0.38)}><circle cx='30' cy='30' r='5'/><circle cx='38' cy='30' r='5'/><circle cx='34' cy='23' r='5'/><circle cx='72' cy='72' r='4'/><circle cx='78' cy='72' r='4'/><circle cx='75' cy='66' r='4'/></g>`
const meadowFlowers = `<g ${F('#C9A23F', 0.35)}><circle cx='24' cy='26' r='4'/><circle cx='74' cy='70' r='4'/></g><g ${F('#FFFFFF', 0.6)}><circle cx='24' cy='26' r='1.6'/><circle cx='74' cy='70' r='1.6'/></g>`
const fence = `<path d='M0 70 H100 M0 82 H100 M22 60 V94 M78 60 V94' ${S('#FFFFFF', 0.32, 3.5)}/>`
const vineLeaf = `<path d='M20 80 Q40 60 60 64 Q80 68 86 50' ${S('#5E7D4A', 0.3)}/><path d='M44 60 Q50 48 60 52 Q56 62 44 60 Z' ${F('#5E7D4A', 0.22)}/>`
const grapeDots = `<g ${F('#FFFFFF', 0.3)}><circle cx='66' cy='26' r='5'/><circle cx='77' cy='26' r='5'/><circle cx='71.5' cy='35' r='5'/><circle cx='28' cy='66' r='4'/><circle cx='36' cy='66' r='4'/><circle cx='32' cy='73' r='4'/></g>`
const bells = `<path d='M70 22 Q70 12 78 12 Q86 12 86 22 L88 28 H68 Z' ${F('#C9A23F', 0.3)}/><circle cx='78' cy='31' r='2.5' ${F('#C9A23F', 0.3)}/>`
const paws = `<g ${F('#FFFFFF', 0.3)}><ellipse cx='30' cy='70' rx='7' ry='6'/><circle cx='22' cy='60' r='3'/><circle cx='29' cy='56' r='3'/><circle cx='37' cy='58' r='3'/><ellipse cx='72' cy='32' rx='6' ry='5'/><circle cx='65' cy='23' r='2.6'/><circle cx='71' cy='20' r='2.6'/><circle cx='78' cy='22' r='2.6'/></g>`
const straw = `<path d='M10 72 L48 60 M18 84 L60 70 M54 30 L92 22 M60 42 L90 36' ${S('#B8862E', 0.3)}/>`
const eggGlow = `<ellipse cx='50' cy='52' rx='13' ry='17' ${F('#FFF6DC', 0.32)}/>`
const leaf = `<path d='M22 78 Q24 56 46 54 Q46 76 22 78 Z' ${F('#8A7A2E', 0.2)}/><path d='M22 78 L40 60' ${S('#8A7A2E', 0.28, 2)}/>`
const wheat = `<path d='M70 90 V40' ${S('#FFFFFF', 0.4)}/><g ${F('#FFFFFF', 0.35)}><ellipse cx='65' cy='50' rx='3' ry='6' transform='rotate(-25 65 50)'/><ellipse cx='75' cy='50' rx='3' ry='6' transform='rotate(25 75 50)'/><ellipse cx='65' cy='62' rx='3' ry='6' transform='rotate(-25 65 62)'/><ellipse cx='75' cy='62' rx='3' ry='6' transform='rotate(25 75 62)'/><ellipse cx='70' cy='38' rx='3' ry='6'/></g>`
const savanna = `<path d='M14 86 Q20 74 22 86 M26 86 Q34 70 34 86 M70 36 Q76 24 78 36' ${S('#8A6A3E', 0.3)}/>`
const ropeNet = `<path d='M0 25 L75 100 M25 0 L100 75 M0 75 L75 0 M25 100 L100 25' ${S('#FFFFFF', 0.28)}/>`
const cobbles = `<g ${S('#7E7464', 0.28, 2.5)}><rect x='8' y='10' width='38' height='22' rx='8'/><rect x='54' y='10' width='38' height='22' rx='8'/><rect x='30' y='40' width='40' height='22' rx='8'/><rect x='8' y='70' width='38' height='22' rx='8'/><rect x='54' y='70' width='38' height='22' rx='8'/></g>`
const feather = `<path d='M24 82 Q30 50 60 30 Q58 60 24 82 Z' ${F('#6E2A1E', 0.16)}/><path d='M24 82 L56 34' ${S('#6E2A1E', 0.24, 2)}/>`
const branch = `<path d='M8 74 Q40 62 92 70' ${S('#FFFFFF', 0.35)}/><path d='M60 66 Q66 54 76 56 Q72 66 60 66 Z' ${F('#FFFFFF', 0.3)}/>`
const wool = (color: string, opacity: number) =>
  `<g ${S(color, opacity, 2.6)}><path d='M20 34 a7 7 0 1 1 10 6 a5 5 0 1 1 -6 -4'/><path d='M64 72 a7 7 0 1 1 10 6 a5 5 0 1 1 -6 -4'/></g>`

/** ลายช่องอ่อนและช่องเข้มของแต่ละชุด */
export const FABLE_PATTERNS: Record<string, { light: string; dark: string }> = {
  sky: { light: tile(sunRays), dark: tile(windSwirl) },
  soda: { light: tile(pebbles), dark: tile(ripples) },
  mint: { light: tile(grass), dark: tile(clover) },
  matcha: { light: tile(meadowFlowers), dark: tile(fence) },
  grape: { light: tile(vineLeaf), dark: tile(grapeDots) },
  lavender: { light: tile(bells), dark: tile(paws) },
  honey: { light: tile(straw), dark: tile(eggGlow) },
  lemon: { light: tile(leaf), dark: tile(wheat) },
  cocoa: { light: tile(savanna), dark: tile(ropeNet) },
  classic: { light: tile(cobbles), dark: tile(wheat) },
  sakura: { light: tile(feather), dark: tile(branch) },
  strawberry: { light: tile(wool('#5A1730', 0.22)), dark: tile(wool('#FFFFFF', 0.35)) },
}

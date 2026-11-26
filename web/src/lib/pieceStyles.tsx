// รูปแบบตัวหมากรุก (รูปทรงของตัวหมาก) เลือกได้เป็นรายตัว: คิงใช้แบบหนึ่ง ม้าใช้อีกแบบหนึ่งก็ได้
// แยกจาก "ชุดหมากรุก" (pieceSets.tsx) ซึ่งกำหนดสีกระดานและสีตัวหมาก
// ค่าที่เลือกเก็บในเบราว์เซอร์ของแต่ละคน (ไม่ส่งไปเซิร์ฟเวอร์) คู่แข่งเห็นแบบของตัวเอง
//
// ---------- วิธีเพิ่มรูปแบบใหม่ ----------
// เพิ่มหนึ่งรายการใน PIECE_STYLES ด้านล่าง ทำได้สองแบบ:
//
//  1) วาดด้วย SVG ในโค้ด: ใส่ `draw(kind, paint)` ที่คืน element ของ SVG ในกรอบ 45×45
//     ใช้ paint.fill เป็นสีตัวหมาก (เปลี่ยนตามชุดสีที่ผู้เล่นเลือก) และ paint.ink เป็นสีเส้น
//
//  2) ใช้ไฟล์รูป: วางไฟล์ไว้ที่ web/public/pieces/<id>/ ตั้งชื่อ wK.svg, bK.svg, wQ.svg ... (สี + ตัวหมาก)
//     แล้วใส่ `images: '/pieces/<id>'` รูปแบบนี้ไม่เปลี่ยนสีตามชุดสี (สีมาจากไฟล์)
//
// รูปแบบไม่จำเป็นต้องมีครบทุกตัว: ระบุ `kinds` เป็นตัวที่มี ตัวที่ไม่มีจะไม่ขึ้นให้เลือก
// ไม่ต้องแก้ส่วนอื่น: หน้าโปรไฟล์และกระดานอ่านจากรายการนี้

// ไฟล์นี้ไม่มี component (มีแต่ฟังก์ชันวาดตัวหมาก) กฎ fast refresh จึงไม่เกี่ยว
/* oxlint-disable react/only-export-components */

import { useSyncExternalStore, type JSX } from 'react'
import type { Color } from './protocol'

/** ตัวหมากของหมากรุกสากล ซึ่งเป็นตัวที่เลือกรูปแบบได้ */
export type ChessKind = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P'
export const CHESS_KINDS: ChessKind[] = ['K', 'Q', 'R', 'B', 'N', 'P']
export const KIND_NAMES: Record<ChessKind, string> = { K: 'คิง', Q: 'ควีน', R: 'เรือ', B: 'บิชอป', N: 'ม้า', P: 'เบี้ย' }

const INK = '#3B2F4A'
const VS = '︎' // บังคับให้สัญลักษณ์แสดงเป็นตัวอักษร ไม่ใช่ emoji สี
const GLYPH_FONT = "'Segoe UI Symbol', 'Noto Sans Symbols 2', 'Apple Symbols', 'DejaVu Sans', sans-serif"
const GLYPH: Record<ChessKind, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' }

export interface Paint {
  /** สีตัวหมากตามชุดสีที่เลือก */
  fill: string
  /** สีเส้นขอบ */
  ink: string
  color: Color
}

export interface PieceStyle {
  id: string
  name: string
  desc: string
  /** ตัวหมากที่รูปแบบนี้มี (ไม่ระบุ = ครบทุกตัว) */
  kinds?: ChessKind[]
  /** วาดตัวหมากในกรอบ 45×45 */
  draw?: (kind: ChessKind, paint: Paint) => JSX.Element
  /** โฟลเดอร์ของไฟล์รูป เช่น '/pieces/cute' (ไฟล์ชื่อ wK.svg, bQ.svg, ...) */
  images?: string
}

const stroke = (ink: string, width = 1.7) => ({ stroke: ink, strokeWidth: width, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const })

/** รูปแบบเดิม: สัญลักษณ์หมากรุกจากฟอนต์ของเครื่อง */
function drawGlyph(kind: ChessKind, { fill, ink }: Paint): JSX.Element {
  return (
    <text x="22.5" y="25" textAnchor="middle" dominantBaseline="middle" fontSize="35" fontFamily={GLYPH_FONT} fill={fill} stroke={ink} strokeWidth="1.5" paintOrder="stroke" strokeLinejoin="round">
      {GLYPH[kind] + VS}
    </text>
  )
}

/** ฐานของตัวหมากแบบเรขาคณิต ใช้ร่วมกันทุกตัว */
const BASE = <rect x="11.5" y="34" width="22" height="5.5" rx="2.4" />

const SHAPES: Record<ChessKind, JSX.Element> = {
  P: (
    <>
      <path d="M15 35 Q22.5 15 30 35 Z" />
      <circle cx="22.5" cy="14.5" r="6.2" />
      {BASE}
    </>
  ),
  R: (
    <>
      <path d="M11 9.5 h5 v4 h4 v-4 h5 v4 h4 v-4 h5 v9.5 h-3 v12 h3.5 v4 H10.5 v-4 h3.5 v-12 h-3 Z" />
      {BASE}
    </>
  ),
  N: (
    <>
      <path d="M14 35 L14 31 Q14 20 22 15 L20 7.5 L27.5 11 Q37 15.5 35.5 27 L30 25.5 L26 29 Q30 31.5 31 35 Z" />
      <circle cx="27" cy="17.5" r="1.5" fill={INK} stroke="none" />
      {BASE}
    </>
  ),
  B: (
    <>
      <path d="M22.5 9 Q32 18.5 27.5 26.5 L30 34.5 H15 L17.5 26.5 Q13 18.5 22.5 9 Z" />
      <path d="M22.5 15 v7 M19 18.5 h7" fill="none" />
      <circle cx="22.5" cy="7.2" r="2.6" />
      {BASE}
    </>
  ),
  Q: (
    <>
      <path d="M10.5 15.5 L17 26 L22.5 12 L28 26 L34.5 15.5 L31 34.5 H14 Z" />
      <circle cx="10.5" cy="14" r="2.6" />
      <circle cx="22.5" cy="10" r="2.6" />
      <circle cx="34.5" cy="14" r="2.6" />
      {BASE}
    </>
  ),
  K: (
    <>
      <path d="M14 34.5 Q8.5 21.5 17 19.5 Q22.5 18.5 22.5 25 Q22.5 18.5 28 19.5 Q36.5 21.5 31 34.5 Z" />
      <path d="M22.5 5.5 v12 M18 9.5 h9" fill="none" strokeWidth="3" />
      {BASE}
    </>
  ),
}

/** รูปแบบตัวอย่าง: รูปทรงเรขาคณิตเรียบ ๆ วาดในโค้ด หน้าตาเหมือนกันทุกเครื่อง */
function drawShape(kind: ChessKind, { fill, ink }: Paint): JSX.Element {
  return (
    <g fill={fill} {...stroke(ink)}>
      {SHAPES[kind]}
    </g>
  )
}

/** รูปแบบตัวอย่าง: ป้ายตัวอักษรย่อของตัวหมาก อ่านง่ายสำหรับคนเพิ่งหัดเล่น */
function drawLetter(kind: ChessKind, { fill, ink, color }: Paint): JSX.Element {
  return (
    <g>
      <rect x="6.5" y="6.5" width="32" height="32" rx="10" fill={fill} {...stroke(ink, 2)} />
      <text x="22.5" y="24" textAnchor="middle" dominantBaseline="middle" fontSize="21" fontFamily="'Mitr', sans-serif" fontWeight="600" fill={color === 'w' ? ink : '#FFFFFF'}>
        {kind}
      </text>
    </g>
  )
}

export const PIECE_STYLES: PieceStyle[] = [
  { id: 'glyph', name: 'สัญลักษณ์', desc: 'สัญลักษณ์หมากรุกจากฟอนต์ของเครื่อง (แบบเดิม)', draw: drawGlyph },
  { id: 'shape', name: 'เรขาคณิต', desc: 'รูปทรงเรียบ ๆ วาดในระบบ หน้าตาเหมือนกันทุกเครื่อง (ตัวอย่าง)', draw: drawShape },
  { id: 'letter', name: 'ตัวอักษร', desc: 'ป้ายตัวอักษรย่อ K Q R B N P (ตัวอย่าง)', draw: drawLetter },
]

export const DEFAULT_STYLE = PIECE_STYLES[0].id

export function styleById(id: string | undefined): PieceStyle {
  return PIECE_STYLES.find((s) => s.id === id) ?? PIECE_STYLES[0]
}

/** รูปแบบนี้มีตัวหมากชนิดนี้หรือไม่ */
export function styleHas(style: PieceStyle, kind: ChessKind): boolean {
  return !style.kinds || style.kinds.includes(kind)
}

/** รูปแบบที่เลือกได้สำหรับตัวหมากชนิดหนึ่ง */
export function stylesFor(kind: ChessKind): PieceStyle[] {
  return PIECE_STYLES.filter((s) => styleHas(s, kind))
}

/** รูปแบบที่ผู้เล่นเลือกของตัวหมากแต่ละชนิด */
export type StylePrefs = Record<ChessKind, string>

export const DEFAULT_STYLES: StylePrefs = { K: DEFAULT_STYLE, Q: DEFAULT_STYLE, R: DEFAULT_STYLE, B: DEFAULT_STYLE, N: DEFAULT_STYLE, P: DEFAULT_STYLE }

/**
 * ทำให้ค่าที่อ่านมาใช้ได้เสมอ: รูปแบบที่ไม่มีแล้ว (ถูกเอาออก) หรือไม่มีตัวหมากชนิดนั้น กลับไปใช้แบบเริ่มต้น
 */
export function cleanStylePrefs(value: unknown): StylePrefs {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const out = { ...DEFAULT_STYLES }
  for (const kind of CHESS_KINDS) {
    const style = PIECE_STYLES.find((s) => s.id === raw[kind])
    if (style && styleHas(style, kind)) out[kind] = style.id
  }
  return out
}

/** ตัวหมากของเกมอื่นใช้รูปแบบของตัวหมากรุกสากลที่หน้าตาตรงกัน: เม็ด=ควีน โคน=บิชอป เบี้ยหงาย=เบี้ย */
const SAME_AS: Record<string, ChessKind> = { M: 'Q', S: 'B', F: 'P' }

/** ตัวหมากรุกสากลที่ใช้กำหนดรูปแบบของตัวหมาก `kind` หรือ null ถ้าตัวนั้นไม่มีรูปแบบให้เลือก (หมากฮอส หมากหนีบ) */
export function styleKind(kind: string): ChessKind | null {
  if (CHESS_KINDS.includes(kind as ChessKind)) return kind as ChessKind
  return SAME_AS[kind] ?? null
}

/** วาดตัวหมากตามรูปแบบ (เฉพาะรูปทรง ไม่รวมป้ายที่มุม) */
export function drawPiece(styleId: string | undefined, kind: ChessKind, paint: Paint): JSX.Element {
  let style = styleById(styleId)
  if (!styleHas(style, kind)) style = PIECE_STYLES[0]
  if (style.images) {
    return <image href={`${style.images}/${paint.color}${kind}.svg`} x="2" y="2" width="41" height="41" preserveAspectRatio="xMidYMid meet" />
  }
  return (style.draw ?? drawGlyph)(kind, paint)
}

// ---------- ค่าที่ผู้เล่นเลือก ----------

const STORAGE_KEY = 'checkmate.pieceStyles'
const listeners = new Set<() => void>()
let current: StylePrefs | null = null

function read(): StylePrefs {
  try {
    return cleanStylePrefs(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return DEFAULT_STYLES // ค่าเสียหรือโหมดที่ปิด storage
  }
}

function getSnapshot(): StylePrefs {
  current ??= read()
  return current
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return
    current = read()
    onChange()
  }
  listeners.add(onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

function store(next: StylePrefs): void {
  current = cleanStylePrefs(next)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // เก็บไม่ได้ก็ยังใช้ได้จนกว่าจะปิดหน้า
  }
  for (const notify of listeners) notify()
}

/** เลือกรูปแบบของตัวหมากหนึ่งชนิด */
export function setPieceStyle(kind: ChessKind, styleId: string): void {
  store({ ...getSnapshot(), [kind]: styleId })
}

/** ใช้รูปแบบเดียวกับทุกตัว (ตัวที่รูปแบบนั้นไม่มี คงแบบเดิมไว้) */
export function setAllPieceStyles(styleId: string): void {
  const style = styleById(styleId)
  const next = { ...getSnapshot() }
  for (const kind of CHESS_KINDS) if (styleHas(style, kind)) next[kind] = style.id
  store(next)
}

/** รูปแบบที่เลือกของตัวหมากแต่ละชนิด อัปเดตเองเมื่อเปลี่ยน */
export function useStylePrefs(): StylePrefs {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/** ใช้ใน test: ล้างค่าที่จำไว้ในหน่วยความจำ */
export function resetStylePrefsForTest(): void {
  current = null
}

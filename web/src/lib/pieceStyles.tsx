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

const INK = '#2B2A33'
const GOLD = '#C9A45C'

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
  /** ที่อยู่รูปรายตัว (รหัสเช่น 'wK') ของรูปแบบที่เพิ่มจากหน้าจัดการรูปแบบหมาก */
  imageOf?: Record<string, string>
}

const stroke = (ink: string, width = 1.7) => ({ stroke: ink, strokeWidth: width, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const })

// ---------- รูปแบบคลาสสิก (ค่าเริ่มต้น) ----------
// ตัวหมากทรงมาตรฐานวาดเป็นเวกเตอร์ หน้าตาเหมือนกันทุกเครื่อง (ไม่ขึ้นกับฟอนต์ของเครื่อง)
// ทุกตัวใช้ฐานเดียวกันและคาดแหวนทองที่คอ สีตัวหมากมาจากชุดสีที่ผู้เล่นเลือก

/** ฐานสองชั้นของตัวหมากคลาสสิก */
const FOOT = (
  <>
    <rect x="13.5" y="33.4" width="18" height="2.8" rx="1.4" />
    <path d="M11.5 39.5 Q11.5 36.6 14.5 36.2 H30.5 Q33.5 36.6 33.5 39.5 Z" />
  </>
)

/** แหวนทองที่คอ */
const collar = (y: number, rx: number) => <ellipse cx="22.5" cy={y} rx={rx} ry="1.7" fill={GOLD} />

/** ลำตัวทรงกลึงของตัวหมากสูง: บานที่ฐาน คอดที่คอ */
const STEM = <path d="M15.8 33.4 Q20.2 28 18.8 22.4 H26.2 Q24.8 28 29.2 33.4 Z" />

/** `detail` คือสีเส้นรายละเอียดบนตัวหมาก (ต้องตัดกับสีตัวหมาก) */
const classic = (detail: string): Record<ChessKind, JSX.Element> => ({
  P: (
    <>
      <path d="M18 33.4 Q21.4 27.5 20.4 21.6 H24.6 Q23.6 27.5 27 33.4 Z" />
      {collar(21.2, 5.4)}
      <circle cx="22.5" cy="14.6" r="5.6" />
      {FOOT}
    </>
  ),
  R: (
    <>
      <path d="M16.8 18 H28.2 L29.4 33.4 H15.6 Z" />
      <path d="M14.2 8.6 h3.8 v2.8 h2.6 V8.6 h3.8 v2.8 h2.6 V8.6 h3.8 v7 q0 2 -2 2.4 H16.2 q-2 -0.4 -2 -2.4 Z" />
      {collar(18.6, 7.2)}
      {FOOT}
    </>
  ),
  N: (
    <>
      <path d="M16 33.4 C16.2 28.6 20.6 26.4 20.9 22.6 C18.6 23.2 16.4 25.6 13.8 24.7 C11.7 24 11 21.7 12.1 20 L17.2 12.8 L18 7.4 L21.8 10.6 C28.6 11.2 32.6 18 31.4 33.4 Z" />
      <path d="M24.2 13.6 C28 17.2 29.2 23 28.6 30" fill="none" stroke={detail} strokeWidth="1" opacity="0.6" />
      <circle cx="17.6" cy="16.8" r="1" fill={detail} stroke="none" />
      {FOOT}
    </>
  ),
  B: (
    <>
      <path d="M17.6 33.4 Q21.2 27 20.2 20.8 H24.8 Q23.8 27 27.4 33.4 Z" />
      {collar(20.4, 6)}
      <path d="M22.5 6.8 C27.6 11.2 28.8 15.2 26.4 18.6 H18.6 C16.2 15.2 17.4 11.2 22.5 6.8 Z" />
      <path d="M24.9 10.6 L21.9 14.8" fill="none" stroke={detail} />
      <circle cx="22.5" cy="5.2" r="1.7" />
      {FOOT}
    </>
  ),
  Q: (
    <>
      {STEM}
      <path d="M14.4 20.2 L12 10.6 L17.2 15.2 L19.4 8.2 L22.5 14.6 L25.6 8.2 L27.8 15.2 L33 10.6 L30.6 20.2 Z" />
      <circle cx="12" cy="9.4" r="1.6" />
      <circle cx="19.4" cy="7" r="1.6" />
      <circle cx="25.6" cy="7" r="1.6" />
      <circle cx="33" cy="9.4" r="1.6" />
      {collar(21.6, 8.4)}
      {FOOT}
    </>
  ),
  K: (
    <>
      {STEM}
      <path d="M21.3 3 h2.4 v2.7 h2.7 v2.4 h-2.7 v3.4 h-2.4 v-3.4 h-2.7 v-2.4 h2.7 Z" />
      <path d="M15.2 20.2 Q12.6 13.8 17.6 12 Q22.5 10.6 27.4 12 Q32.4 13.8 29.8 20.2 Z" />
      {collar(21.6, 8.4)}
      {FOOT}
    </>
  ),
})

const CLASSIC_ON_LIGHT = classic(INK)
const CLASSIC_ON_DARK = classic('#FFF6DC')

/** รูปแบบเริ่มต้น: ตัวหมากคลาสสิกวาดในระบบ */
function drawClassic(kind: ChessKind, { fill, ink, color }: Paint): JSX.Element {
  return (
    <g fill={fill} {...stroke(ink, 1.3)}>
      {(color === 'w' ? CLASSIC_ON_LIGHT : CLASSIC_ON_DARK)[kind]}
    </g>
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
      <text x="22.5" y="24" textAnchor="middle" dominantBaseline="middle" fontSize="21" fontFamily="'IBM Plex Sans Thai', sans-serif" fontWeight="700" fill={color === 'w' ? ink : '#FFFFFF'}>
        {kind}
      </text>
    </g>
  )
}

/** รหัสของรูปแบบ "ตัวละครนิทาน": ตัวหมากเป็นตัวละครของชุดหมากรุกที่ใช้อยู่ (วาดใน pieceSets เพราะต้องรู้ว่าใช้ชุดไหน) */
export const FABLE_STYLE = 'fable'

export const PIECE_STYLES: PieceStyle[] = [
  { id: 'classic', name: 'คลาสสิก', desc: 'ตัวหมากทรงมาตรฐาน คาดแหวนทอง', draw: drawClassic },
  { id: FABLE_STYLE, name: 'ตัวละครนิทาน', desc: 'ตัวละครในนิทานของชุดหมากรุกที่ใช้อยู่', draw: drawClassic },
  { id: 'shape', name: 'เรขาคณิต', desc: 'รูปทรงเรียบ ๆ', draw: drawShape },
  { id: 'letter', name: 'ตัวอักษร', desc: 'ป้ายตัวอักษรย่อ K Q R B N P', draw: drawLetter },
]

export const DEFAULT_STYLE = PIECE_STYLES[0].id

// ---------- รูปแบบที่เพิ่มจากหน้าจัดการรูปแบบหมาก (มาจากเซิร์ฟเวอร์) ----------

/** รูปแบบหนึ่งชุดตามที่เซิร์ฟเวอร์เก็บ */
export interface RemoteStyle {
  id: string
  rev: number
  name: string
  /** รหัสตัวหมาก (เช่น 'wK') → ที่อยู่รูป */
  images: Record<string, string>
}

const IMAGE_URL = /^\/api\/content-images\/[0-9a-f]{32}$/
const PIECE_CODE = /^[wb][KQRBNP]$/

/** อ่าน response ของ /api/piece-styles ค่าที่รูปแบบผิดถูกทิ้ง คืน null ถ้าไม่ใช่รูปแบบที่รู้จัก */
export function parseRemoteStyles(body: unknown): RemoteStyle[] | null {
  const list = (body as { styles?: unknown } | null)?.styles
  if (!Array.isArray(list)) return null
  const out: RemoteStyle[] = []
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue
    const raw = item as Record<string, unknown>
    if (typeof raw.id !== 'string' || !/^[a-z0-9_-]{1,24}$/.test(raw.id)) continue
    const images: Record<string, string> = {}
    for (const [piece, url] of Object.entries((raw.images ?? {}) as Record<string, unknown>)) {
      if (PIECE_CODE.test(piece) && typeof url === 'string' && IMAGE_URL.test(url)) images[piece] = url
    }
    out.push({ id: raw.id, rev: typeof raw.rev === 'number' ? raw.rev : 0, name: typeof raw.name === 'string' ? raw.name : '', images })
  }
  return out
}

/** ตัวหมากที่รูปแบบจากเซิร์ฟเวอร์มีรูปครบทั้งสองสี (ตัวที่ยังไม่ครบไม่ขึ้นให้เลือก) */
export function readyKinds(style: RemoteStyle): ChessKind[] {
  return CHESS_KINDS.filter((k) => style.images['w' + k] && style.images['b' + k])
}

/** รหัสของรูปแบบจากเซิร์ฟเวอร์ ขึ้นต้นด้วย u- เพื่อไม่ชนกับรูปแบบในระบบ */
export const remoteStyleId = (id: string) => 'u-' + id

let remote: PieceStyle[] = []
let remoteRequested = false

/** ตั้งรายการรูปแบบจากเซิร์ฟเวอร์ (เรียกหลังโหลด และหลังแก้ในหน้าจัดการ) */
export function setRemoteStyles(list: RemoteStyle[]): void {
  remote = list
    .map((s) => ({ id: remoteStyleId(s.id), name: s.name, desc: 'รูปแบบที่ทีมงานเพิ่ม', kinds: readyKinds(s), imageOf: s.images }))
    .filter((s) => s.kinds.length > 0)
  // เปลี่ยนตัวอ้างอิงของค่าที่เลือก เพื่อให้กระดานและหน้าโปรไฟล์วาดใหม่ด้วยรูปแบบที่เพิ่งมาถึง
  current = { ...getSnapshot() }
  for (const notify of listeners) notify()
}

function requestRemoteStyles(): void {
  if (remoteRequested || typeof fetch !== 'function') return
  remoteRequested = true
  fetch('/api/piece-styles')
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => {
      const list = parseRemoteStyles(body)
      if (list) setRemoteStyles(list)
    })
    .catch(() => {
      // โหลดไม่ได้: ใช้รูปแบบในระบบต่อไป ตัวที่เลือกแบบจากเซิร์ฟเวอร์ไว้จะแสดงเป็นแบบเริ่มต้น
    })
}

/** รูปแบบทั้งหมดที่เลือกได้ตอนนี้: ของระบบ ตามด้วยของที่เพิ่มจากหน้าจัดการ */
export function allStyles(): PieceStyle[] {
  return remote.length > 0 ? [...PIECE_STYLES, ...remote] : PIECE_STYLES
}

export function styleById(id: string | undefined): PieceStyle {
  return allStyles().find((s) => s.id === id) ?? PIECE_STYLES[0]
}

/** รูปแบบนี้มีตัวหมากชนิดนี้หรือไม่ */
export function styleHas(style: PieceStyle, kind: ChessKind): boolean {
  return !style.kinds || style.kinds.includes(kind)
}

/** รูปแบบที่เลือกได้สำหรับตัวหมากชนิดหนึ่ง */
export function stylesFor(kind: ChessKind): PieceStyle[] {
  return allStyles().filter((s) => styleHas(s, kind))
}

/** รูปแบบที่ผู้เล่นเลือกของตัวหมากแต่ละชนิด */
export type StylePrefs = Record<ChessKind, string>

/** ค่าเริ่มต้น: ตัวหมากคลาสสิกทุกตัว ยกเว้นเบี้ยที่เป็นตัวละครนิทานของชุด */
export const DEFAULT_STYLES: StylePrefs = { K: DEFAULT_STYLE, Q: DEFAULT_STYLE, R: DEFAULT_STYLE, B: DEFAULT_STYLE, N: DEFAULT_STYLE, P: FABLE_STYLE }

/**
 * ทำให้ค่าที่อ่านมาใช้ได้เสมอ: ค่าที่ไม่ใช่รหัสรูปแบบกลับไปเป็นแบบเริ่มต้น
 * รหัสที่ยังไม่รู้จักถูกเก็บไว้ เพราะรูปแบบจากเซิร์ฟเวอร์มาถึงทีหลัง ตอนวาด (drawPiece) ถ้ารูปแบบนั้นไม่มีแล้ว
 * หรือไม่มีตัวหมากชนิดนั้น จะวาดเป็นแบบเริ่มต้นเอง
 */
export function cleanStylePrefs(value: unknown): StylePrefs {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const out = { ...DEFAULT_STYLES }
  for (const kind of CHESS_KINDS) {
    const id = raw[kind]
    // 'glyph' คือรูปแบบสัญลักษณ์จากฟอนต์ของเครื่องที่เลิกใช้แล้ว ค่าที่เก็บไว้จึงกลับเป็นค่าเริ่มต้น
    if (typeof id === 'string' && id !== 'glyph' && /^[a-z0-9_-]{1,40}$/.test(id)) out[kind] = id
  }
  return out
}

/** รูปแบบที่ใช้วาดตัวหมากชนิดนี้จริง (ถ้าที่เลือกไว้ใช้ไม่ได้ = แบบเริ่มต้น) */
export function effectiveStyle(styleId: string | undefined, kind: ChessKind): PieceStyle {
  const style = styleById(styleId)
  return styleHas(style, kind) ? style : PIECE_STYLES[0]
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
  const style = effectiveStyle(styleId, kind)
  const url = style.imageOf?.[paint.color + kind]
  if (url) {
    return <image href={url} x="1.5" y="1.5" width="42" height="42" preserveAspectRatio="xMidYMid meet" />
  }
  if (style.images) {
    return <image href={`${style.images}/${paint.color}${kind}.svg`} x="2" y="2" width="41" height="41" preserveAspectRatio="xMidYMid meet" />
  }
  return (style.draw ?? drawClassic)(kind, paint)
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
  requestRemoteStyles()
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
  remote = []
}

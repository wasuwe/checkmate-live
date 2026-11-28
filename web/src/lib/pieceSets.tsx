// ชุดหมากรุก: สีกระดานและสีตัวหมาก ผู้เล่นเก็บชุดที่ชอบได้สูงสุด 5 ช่องและเลือกใช้หนึ่งชุด
// ค่าที่เลือกเก็บในเบราว์เซอร์ของแต่ละคน (ไม่ส่งไปเซิร์ฟเวอร์) คู่แข่งเห็นชุดของตัวเอง
//
// ตัวหมากวาดจากสัญลักษณ์หมากรุกในฟอนต์ของเครื่อง ระบายสีตามชุด และมีป้ายเล็กที่มุมบอกชนิดหมาก
// เพื่อให้อ่านออกเสมอไม่ว่าจะใช้ชุดสีไหน

// ไฟล์นี้ไม่มี component (มีแต่ฟังก์ชันวาดตัวหมาก) กฎ fast refresh จึงไม่เกี่ยว
/* oxlint-disable react/only-export-components */

import { cloneElement, useSyncExternalStore, type CSSProperties, type JSX } from 'react'
import { FABLE_PATTERNS, fablePiece } from './fables'
import { heroFigure } from './heroes'
import { DEFAULT_STYLES, drawPiece, FABLE_STYLE, styleKind, type StylePrefs } from './pieceStyles'
import type { Color } from './protocol'

export const INK = '#2B2A33'
/** บังคับให้สัญลักษณ์แสดงเป็นตัวอักษร ไม่ใช่ emoji สี */
export const VS = '︎'
export const GLYPH_FONT =
  "'Segoe UI Symbol', 'Noto Sans Symbols 2', 'Apple Symbols', 'DejaVu Sans', sans-serif"

/**
 * ชนิดหมาก: หกตัวแรกของหมากรุกสากล, M เม็ด S โคน F เบี้ยหงาย ของหมากรุกไทย,
 * C เบี้ย H ฮอส ของหมากฮอส, O หมากของหมากหนีบ
 */
export type Kind = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'M' | 'S' | 'F' | 'C' | 'H' | 'O'
export const KINDS: Kind[] = ['K', 'Q', 'R', 'B', 'N', 'P']
export const MAKRUK_KINDS: Kind[] = ['K', 'M', 'S', 'N', 'R', 'P', 'F']
export const CHECKERS_KINDS: Kind[] = ['C', 'H']
export const NEEB_KINDS: Kind[] = ['O']
const ALL_KINDS: Kind[] = ['K', 'Q', 'R', 'B', 'N', 'P', 'M', 'S', 'F', 'C', 'H', 'O']

/** สัญลักษณ์ทึบ ใช้เป็นตัวหมาก (เบี้ยหงายใช้เบี้ยกลับหัว) */
export const GLYPH: Record<Kind, string> = {
  K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟', M: '♛', S: '♝', F: '♟', C: '●', H: '◉', O: '●',
}
/** สัญลักษณ์โปร่ง ใช้เป็นป้ายบอกชนิดหมาก (เบี้ยหงายเดินแบบเม็ด จึงใช้ป้ายเดียวกับเม็ด) */
export const BADGE: Record<Kind, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', M: '♕', S: '♗', F: '♕', C: '○', H: '◎', O: '○',
}
/** หมากที่วาดกลับหัว */
export const FLIPPED: Partial<Record<Kind, boolean>> = { F: true }

export type SetColor = 'pink' | 'green' | 'purple' | 'yellow' | 'blue' | 'brown'

export interface BoardSet {
  id: string
  name: string
  /** ข้อคิดสั้น ๆ ของนิทานที่เป็นชื่อชุด */
  tale: string
  color: SetColor
  /** สีช่องอ่อนและช่องเข้ม */
  light: string
  dark: string
  /** สีตัวหมากฝั่งขาวและฝั่งดำ */
  w: string
  b: string
}

// ชุดหมากรุกตั้งต้นตั้งชื่อตามนิทานอีสปที่คนรู้จักดี สีของแต่ละชุดมาจากฉากในนิทานเรื่องนั้น
// ทุกชุดเป็นโทนสไตล์นิทาน: ช่องอ่อนสีกระดาษงาช้าง ช่องเข้มเป็นสีหม่น ตัวหมากฝั่งดำสีเข้มลึก
// id เดิมของแต่ละชุดคงไว้ ชุดที่ผู้เล่นเก็บไว้ในเบราว์เซอร์จึงยังใช้ได้ (เปลี่ยนแค่สีกับชื่อ)
export const SETS: BoardSet[] = [
  { id: 'sky', name: 'ลมเหนือกับดวงอาทิตย์', tale: 'ความอ่อนโยนชนะความรุนแรง', color: 'blue', light: '#F7F1E3', dark: '#A9B3E6', w: '#FFFDF8', b: '#1E2A6B' },
  { id: 'soda', name: 'อีกากับเหยือกน้ำ', tale: 'ความเพียรกับไหวพริบพาไปถึงเป้าหมาย', color: 'blue', light: '#EEF2F4', dark: '#86A9C4', w: '#FFFFFF', b: '#1D2433' },
  { id: 'mint', name: 'กระต่ายกับเต่า', tale: 'ช้าแต่มั่นคง ย่อมถึงเส้นชัย', color: 'green', light: '#F2F2E6', dark: '#93B8A2', w: '#FFFDF6', b: '#1F4A3A' },
  { id: 'matcha', name: 'เด็กเลี้ยงแกะ', tale: 'โกหกบ่อย ๆ วันที่พูดจริงจะไม่มีใครเชื่อ', color: 'green', light: '#F0F0DE', dark: '#A3AE74', w: '#FFFBEA', b: '#3A3A38' },
  { id: 'grape', name: 'สุนัขจิ้งจอกกับองุ่นเปรี้ยว', tale: 'เอื้อมไม่ถึง อย่าแกล้งว่าไม่อยากได้', color: 'purple', light: '#F2EBF2', dark: '#A086AC', w: '#FFF9FF', b: '#3D2347' },
  { id: 'lavender', name: 'ผูกกระดิ่งแมว', tale: 'พูดนั้นง่าย ลงมือทำนั้นยาก', color: 'purple', light: '#F4F0F8', dark: '#A99BD2', w: '#FFFFFF', b: '#3A2C66' },
  { id: 'honey', name: 'ห่านทองคำ', tale: 'โลภมาก ลาภหาย', color: 'yellow', light: '#FAF3E0', dark: '#D8B56C', w: '#FFFDF6', b: '#5C3D0E' },
  { id: 'lemon', name: 'มดกับตั๊กแตน', tale: 'เตรียมพร้อมไว้ก่อนฤดูหนาวมาถึง', color: 'yellow', light: '#FBF6E6', dark: '#D9C27A', w: '#FFFFFF', b: '#4A3212' },
  { id: 'cocoa', name: 'ราชสีห์กับหนู', tale: 'ตัวเล็กก็ช่วยผู้ยิ่งใหญ่ได้', color: 'brown', light: '#F4E6CF', dark: '#C49A62', w: '#FFF8EE', b: '#5A3414' },
  { id: 'classic', name: 'หนูเมืองกับหนูบ้านนอก', tale: 'ความสงบเรียบง่ายมีค่ากว่าความหรูหรา', color: 'brown', light: '#F5EFE1', dark: '#B9AF9B', w: '#FFFFFF', b: '#2B2A33' },
  { id: 'sakura', name: 'สุนัขจิ้งจอกกับอีกา', tale: 'ระวังคำเยินยอของคนที่หวังผล', color: 'pink', light: '#F7EEE8', dark: '#D9A08E', w: '#FFFDF8', b: '#6E2A1E' },
  { id: 'strawberry', name: 'หมาป่าในคราบแกะ', tale: 'อย่าตัดสินจากเปลือกนอก', color: 'pink', light: '#F6ECE3', dark: '#C77B86', w: '#FFFBF5', b: '#5A1730' },
]

export const SET_FILTERS: { id: SetColor | 'all'; label: string; swatch: string }[] = [
  { id: 'all', label: 'ทั้งหมด', swatch: 'conic-gradient(#A9B3E6 0 17%,#D9A08E 0 33%,#93B8A2 0 50%,#A99BD2 0 67%,#D8B56C 0 83%,#C49A62 0)' },
  { id: 'blue', label: 'ฟ้าคราม', swatch: '#A9B3E6' },
  { id: 'pink', label: 'แดงอิฐ', swatch: '#D9A08E' },
  { id: 'green', label: 'มรกต', swatch: '#93B8A2' },
  { id: 'purple', label: 'ม่วง', swatch: '#A99BD2' },
  { id: 'yellow', label: 'ทอง', swatch: '#D8B56C' },
  { id: 'brown', label: 'น้ำตาล', swatch: '#C49A62' },
]

export function setById(id: string | null | undefined): BoardSet {
  return SETS.find((s) => s.id === id) ?? SETS[0]
}

/** สีและลายของช่องกระดาน: ลายตามนิทานของชุดวางทับสีช่อง */
export function squareStyle(set: BoardSet, dark: boolean): CSSProperties {
  const pattern = FABLE_PATTERNS[set.id]?.[dark ? 'dark' : 'light']
  return {
    backgroundColor: dark ? set.dark : set.light,
    ...(pattern ? { backgroundImage: pattern, backgroundSize: '100% 100%' } : {}),
  }
}

/**
 * ชุดของแต่ละฝั่งในเกม: ชุดที่ผู้เล่นฝั่งนั้นเลือกไว้ในห้องรอ (เซิร์ฟเวอร์ส่งมากับ state)
 * กระดานแบ่งครึ่ง ครึ่งของฝั่งไหนใช้ชุดของฝั่งนั้น และตัวหมากของฝั่งนั้นก็ใช้ชุดเดียวกัน
 * ฝั่งที่ไม่ได้เลือก (หรือรหัสที่หน้าเว็บรุ่นนี้ไม่รู้จัก) ใช้ชุดของผู้ดู `local`
 */
export function sideSets(
  local: BoardSet,
  players: Partial<Record<Color, { set?: string }>> | undefined,
): Record<Color, BoardSet> {
  const pick = (color: Color) => SETS.find((s) => s.id === players?.[color]?.set) ?? local
  return { w: pick('w'), b: pick('b') }
}

/** หมากของฝั่งไหนเริ่มที่ครึ่งกระดานของช่องนี้: แถว 1–4 เป็นครึ่งของฝั่งขาว แถว 5–8 เป็นครึ่งของฝั่งดำ */
export function halfOf(square: string): Color {
  return Number(square[1]) <= 4 ? 'w' : 'b'
}

/** ช่องนี้เป็นช่องเข้มหรือไม่ (a1 เป็นช่องเข้ม) */
export function isDarkSquare(square: string): boolean {
  return (square.charCodeAt(0) - 97 + Number(square[1])) % 2 === 1
}

// ---------- การวาดตัวหมาก ----------

type PieceRenderer = (props?: { fill?: string; square?: string; svgStyle?: CSSProperties }) => JSX.Element
export type PieceRenderers = Record<string, PieceRenderer>

export interface PieceOptions {
  /** ช่องที่หมากเพิ่งเดินมาถึง หมากบนช่องนี้จะเด้งลง */
  landOn?: string
  /** เปลี่ยนค่านี้ทุกตาเดิน เพื่อให้การเด้งเล่นใหม่ */
  landKey?: number
  /** แสดงป้ายบอกชนิดหมากที่มุม (ค่าเริ่มต้น: แสดง) */
  badge?: boolean
  /** รูปแบบตัวหมากที่ผู้เล่นเลือกเป็นรายตัว (ไม่ระบุ = แบบสัญลักษณ์ทุกตัว) */
  styles?: StylePrefs
  /** ชุดของแต่ละฝั่ง: ตัวหมากของฝั่งไหนวาดด้วยชุดของฝั่งนั้น (ไม่ระบุ = ใช้ `set` ทั้งสองฝั่ง) */
  bySide?: Record<Color, BoardSet>
}

/**
 * ชุดและฝั่งที่มีภาพวาดตัวหมากเป็นไฟล์ครบหกชนิด (web/public/pieces/<ชุด>-<ฝั่ง>-<ชนิด>.webp ขนาด 384 × 384 พื้นโปร่งใส)
 * เจ้าของโปรเจกต์เลือกแนวนี้ 2026-11-28: ตัวละครของชุดแต่งเป็นหมากแต่ละชนิด (สวมมงกุฎ อยู่ในหอคอย ขี่ม้าไม้) วาดด้วย AI ในสไตล์เดียวกับการ์ด
 * ฝั่งที่ยังไม่มีไฟล์ใช้ตัวละครที่วาดในโค้ดตามเดิม
 */
const ART_PIECES: Record<string, Color[]> = {
  cocoa: ['w', 'b'],
  sky: ['w', 'b'],
  soda: ['w', 'b'],
  mint: ['w', 'b'],
  matcha: ['w', 'b'],
  grape: ['w', 'b'],
  lavender: ['w'],
}

const artPiece = (setId: string, color: Color, kind: string): JSX.Element => (
  <image href={`/pieces/${setId}-${color}-${kind}.webp`} x="0" y="0" width="45" height="45" />
)

/**
 * ตัวละครตัวใหญ่ของฝั่งหนึ่ง ใช้ในฉากตัวละครโผล่: ถ้าชุดนั้นมีภาพวาดตัวหมาก ใช้ภาพของหมากชนิด kind (แต่ละชนิดมีท่าของตัวเอง)
 * ไม่งั้นใช้ตัวละครที่วาดในโค้ด
 */
export function characterSvg(set: BoardSet, color: Color, kind: string | undefined, opts: { className?: string } = {}): JSX.Element {
  if (kind && 'KQRBNP'.includes(kind) && ART_PIECES[set.id]?.includes(color)) {
    return (
      <svg viewBox="0 0 45 45" className={opts.className ?? 'piece'}>
        {artPiece(set.id, color, kind)}
      </svg>
    )
  }
  return heroSvg(set, color, opts)
}

/**
 * ตัวละครนิทานของฝั่งหนึ่งในชุด แบบตัวเล็กหัวโต (lib/heroes.tsx) ใช้เป็นภาพประกอบ: การ์ดสะสม ฉากเปิดเกม ห้องรอ
 * ชุดที่ไม่มีตัวละคร (ไม่มีในตอนนี้) ใช้ตัวเบี้ยของชุดแทน
 */
export function heroSvg(
  set: BoardSet,
  color: Color,
  opts: { className?: string; style?: CSSProperties; ink?: string } = {},
): JSX.Element {
  // ink: สีเส้นของตัวละคร (ค่าเริ่มต้นคือหมึกเข้มของตัวหมาก การ์ดสะสมใช้สีน้ำตาลทองให้เข้ากับกรอบ)
  const figure = heroFigure(set.id, { fill: color === 'w' ? set.w : set.b, ink: opts.ink ?? INK, color })
  if (!figure) return pieceSvg(set, color, 'P', { badge: false, className: opts.className, style: opts.style })
  return (
    <svg viewBox="0 0 100 100" className={opts.className ?? 'piece'} style={opts.style}>
      {figure}
    </svg>
  )
}

/** ตัวหมากหนึ่งตัวเป็น SVG ใช้ได้ทั้งบนกระดานและที่อื่น */
export function pieceSvg(
  set: BoardSet,
  color: Color,
  kind: Kind,
  opts: { badge?: boolean; className?: string; style?: CSSProperties; key?: string | number; styles?: StylePrefs } = {},
): JSX.Element {
  if (kind === 'C' || kind === 'H' || kind === 'O') return discSvg(set, color, kind === 'H', opts)
  // รูปทรงมาจากรูปแบบที่ผู้เล่นเลือกของตัวหมากรุกสากลที่ตรงกัน (เม็ด=ควีน โคน=บิชอป เบี้ยหงาย=เบี้ย)
  const base = styleKind(kind) ?? 'P'
  const paint = { fill: color === 'w' ? set.w : set.b, ink: INK, color }
  // ค่าเริ่มต้น: ตัวหมากคลาสสิก ส่วนเบี้ยเป็นตัวละครในนิทานของชุด (DEFAULT_STYLES)
  // รูปแบบ "ตัวละครนิทาน" วาดที่นี่เพราะต้องรู้ว่าใช้ชุดไหน ชุดที่ไม่มีตัวละครใช้แบบคลาสสิกแทน
  const styleId = opts.styles?.[base] ?? DEFAULT_STYLES[base]
  // ชุดที่มีภาพวาดตัวหมากเป็นไฟล์ (ART_PIECES): รูปแบบ "ตัวละครนิทาน" ใช้ภาพนั้น ตัวละครแต่งเป็นหมากแต่ละชนิดเอง จึงไม่ต้องมีป้าย
  const art = styleId === FABLE_STYLE && ART_PIECES[set.id]?.includes(color) ? artPiece(set.id, color, base) : undefined
  const fable = !art && styleId === FABLE_STYLE ? fablePiece(set.id, base, paint) : undefined
  const body = art ?? fable ?? drawPiece(styleId, base, paint)
  // ป้ายบอกชนิดหมากที่มุม: ใช้เฉพาะเมื่อรูปทรงไม่ได้บอกชนิดเอง คือตัวละครนิทานที่ไม่ใช่เบี้ย และรูปที่ทีมงานอัปโหลด
  const needsBadge = art ? false : fable ? base !== 'P' : styleId.startsWith('u-')
  return (
    <svg key={opts.key} viewBox="0 0 45 45" className={opts.className ?? 'piece'} style={opts.style}>
      {FLIPPED[kind] ? cloneElement(body, { transform: 'rotate(180 22.5 22.5)' }) : body}
      {opts.badge !== false && needsBadge && (
        <>
          {/* ป้ายชนิดหมาก: วงกลมสีกระดาษงาช้าง ขอบทอง */}
          <circle cx="7.2" cy="7.2" r="5.6" fill="#FBF8F1" stroke="#B08A45" strokeWidth="0.9" />
          <text
            x="7.2"
            y="7.7"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="7.6"
            fontFamily={GLYPH_FONT}
            fill={INK}
          >
            {BADGE[kind] + VS}
          </text>
        </>
      )}
    </svg>
  )
}

/**
 * หมากฮอสและหมากหนีบเป็นเหรียญกลม ฮอสคือเหรียญสองชั้นซ้อนกันและมีมงกุฎ
 * รูปทรงบอกชนิดได้เอง จึงไม่มีป้ายที่มุม
 */
function discSvg(
  set: BoardSet,
  color: Color,
  king: boolean,
  opts: { className?: string; style?: CSSProperties; key?: string | number },
): JSX.Element {
  const fill = color === 'w' ? set.w : set.b
  const disc = (cy: number) => (
    <>
      <circle cx="22.5" cy={cy} r="15.5" fill={fill} stroke={INK} strokeWidth="2" />
      <circle cx="22.5" cy={cy} r="10.5" fill="none" stroke={INK} strokeWidth="1.1" opacity="0.4" />
    </>
  )
  return (
    <svg key={opts.key} viewBox="0 0 45 45" className={opts.className ?? 'piece'} style={opts.style}>
      {king ? (
        <>
          {disc(26)}
          {disc(20)}
          {/* มงกุฎของฮอส วาดเป็นเวกเตอร์ให้เหมือนกันทุกเครื่อง */}
          <path
            d="M16 23.6 L14.8 16.4 L18.9 19.6 L22.5 14.4 L26.1 19.6 L30.2 16.4 L29 23.6 Z"
            fill="#C9A45C"
            stroke={INK}
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </>
      ) : (
        disc(22.5)
      )}
    </svg>
  )
}

/** ตัววาดหมากทุกตัวของทุกเกมสำหรับ react-chessboard (รหัสเช่น wK, bP, wM) */
export function piecesFor(set: BoardSet, opts: PieceOptions = {}): PieceRenderers {
  const out: PieceRenderers = {}
  for (const color of ['w', 'b'] as const) {
    for (const kind of ALL_KINDS) {
      out[color + kind] = (props) => {
        const landing = props?.square !== undefined && props.square === opts.landOn
        return pieceSvg(opts.bySide?.[color] ?? set, color, kind, {
          badge: opts.badge,
          styles: opts.styles,
          className: landing ? 'piece land' : 'piece',
          style: props?.svgStyle,
          // key ใหม่ทำให้หมากที่เพิ่งเดินถูกสร้างใหม่ การเด้งจึงเล่นหนึ่งครั้งต่อตาเดิน
          key: landing ? `land-${opts.landKey ?? 0}` : 'piece',
        })
      }
    }
  }
  return out
}

/** กระดานตัวอย่าง 4×4 ของชุด: เบี้ย (ตัวละครในนิทาน) กับควีนของทั้งสองฝั่ง */
const PREVIEW: Record<number, [Kind, Color]> = { 1: ['P', 'b'], 2: ['Q', 'b'], 13: ['Q', 'w'], 14: ['P', 'w'] }

export function previewCells(
  set: BoardSet,
): { bg: string; style: CSSProperties; glyph: string; color: string; piece: [Kind, Color] | null }[] {
  return Array.from({ length: 16 }, (_, i) => {
    const dark = ((i >> 2) + (i & 3)) % 2 === 1
    const piece = PREVIEW[i] ?? null
    return {
      bg: dark ? set.dark : set.light,
      style: squareStyle(set, dark),
      glyph: piece ? GLYPH[piece[0]] + VS : '',
      color: piece ? (piece[1] === 'w' ? set.w : set.b) : 'transparent',
      piece,
    }
  })
}

// ---------- ชุดที่ผู้เล่นเก็บไว้ ----------

export const MAX_SLOTS = 5

export interface SetPrefs {
  /** id ของชุดในแต่ละช่อง (1–5 ช่อง) */
  slots: string[]
  /** ช่องที่กำลังใช้ */
  active: number
}

export const DEFAULT_PREFS: SetPrefs = { slots: ['sky', 'mint', 'cocoa'], active: 0 }

/** ทำให้ค่าที่อ่านมาใช้ได้เสมอ ไม่ว่าในที่เก็บจะเป็นอะไร */
export function cleanPrefs(value: unknown): SetPrefs {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<SetPrefs>
  const slots = (Array.isArray(raw.slots) ? raw.slots : [])
    .filter((id): id is string => typeof id === 'string' && SETS.some((s) => s.id === id))
    .slice(0, MAX_SLOTS)
  if (slots.length === 0) return DEFAULT_PREFS
  const active = Number.isInteger(raw.active) && raw.active! >= 0 && raw.active! < slots.length ? raw.active! : 0
  return { slots, active }
}

export function withSlot(prefs: SetPrefs, slot: number, setId: string): SetPrefs {
  if (slot < 0 || slot >= prefs.slots.length) return prefs
  const slots = prefs.slots.slice()
  slots[slot] = setById(setId).id
  return { ...prefs, slots }
}

export function withAddedSlot(prefs: SetPrefs): SetPrefs {
  if (prefs.slots.length >= MAX_SLOTS) return prefs
  return { ...prefs, slots: [...prefs.slots, 'classic'] }
}

/** ลบช่อง ต้องเหลืออย่างน้อยหนึ่งช่อง ช่องที่ใช้อยู่ยังชี้ชุดเดิมถ้าเป็นไปได้ */
export function withoutSlot(prefs: SetPrefs, slot: number): SetPrefs {
  if (prefs.slots.length <= 1 || slot < 0 || slot >= prefs.slots.length) return prefs
  const slots = prefs.slots.filter((_, i) => i !== slot)
  const active = prefs.active === slot ? 0 : prefs.active > slot ? prefs.active - 1 : prefs.active
  return { slots, active }
}

export function withActive(prefs: SetPrefs, slot: number): SetPrefs {
  return slot >= 0 && slot < prefs.slots.length ? { ...prefs, active: slot } : prefs
}

const STORAGE_KEY = 'checkmate.sets'
const listeners = new Set<() => void>()
let current: SetPrefs | null = null

function read(): SetPrefs {
  try {
    return cleanPrefs(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return DEFAULT_PREFS // ค่าเสียหรือโหมดที่ปิด storage
  }
}

function getSnapshot(): SetPrefs {
  current ??= read()
  return current
}

function subscribe(onChange: () => void): () => void {
  // แท็บอื่นเปลี่ยนชุด: อ่านค่าใหม่
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

/** เปลี่ยนค่าที่เก็บไว้ด้วยฟังก์ชัน เช่น updateSetPrefs((p) => withActive(p, 1)) */
export function updateSetPrefs(change: (prefs: SetPrefs) => SetPrefs): void {
  current = cleanPrefs(change(getSnapshot()))
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // เก็บไม่ได้ก็ยังใช้ได้จนกว่าจะปิดหน้า
  }
  for (const notify of listeners) notify()
}

/** ชุดที่เก็บไว้และชุดที่กำลังใช้ อัปเดตเองเมื่อเปลี่ยน */
export function useSetPrefs(): SetPrefs & { set: BoardSet } {
  const prefs = useSyncExternalStore(subscribe, getSnapshot)
  return { ...prefs, set: setById(prefs.slots[prefs.active]) }
}

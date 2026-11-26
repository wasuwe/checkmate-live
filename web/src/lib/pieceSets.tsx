// ชุดหมากรุก: สีกระดานและสีตัวหมาก ผู้เล่นเก็บชุดที่ชอบได้สูงสุด 5 ช่องและเลือกใช้หนึ่งชุด
// ค่าที่เลือกเก็บในเบราว์เซอร์ของแต่ละคน (ไม่ส่งไปเซิร์ฟเวอร์) คู่แข่งเห็นชุดของตัวเอง
//
// ตัวหมากวาดจากสัญลักษณ์หมากรุกในฟอนต์ของเครื่อง ระบายสีตามชุด และมีป้ายเล็กที่มุมบอกชนิดหมาก
// เพื่อให้อ่านออกเสมอไม่ว่าจะใช้ชุดสีไหน

// ไฟล์นี้ไม่มี component (มีแต่ฟังก์ชันวาดตัวหมาก) กฎ fast refresh จึงไม่เกี่ยว
/* oxlint-disable react/only-export-components */

import { cloneElement, useSyncExternalStore, type CSSProperties, type JSX } from 'react'
import { drawPiece, styleKind, type StylePrefs } from './pieceStyles'
import type { Color } from './protocol'

export const INK = '#3B2F4A'
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
  color: SetColor
  /** สีช่องอ่อนและช่องเข้ม */
  light: string
  dark: string
  /** สีตัวหมากฝั่งขาวและฝั่งดำ */
  w: string
  b: string
}

export const SETS: BoardSet[] = [
  { id: 'sakura', name: 'ซากุระ', color: 'pink', light: '#FFE8EF', dark: '#F7A1BC', w: '#FFFFFF', b: '#B0477A' },
  { id: 'strawberry', name: 'สตรอว์เบอร์รี', color: 'pink', light: '#FFF0F0', dark: '#FF8E9E', w: '#FFF7F2', b: '#8A2338' },
  { id: 'mint', name: 'มิ้นต์ช็อก', color: 'green', light: '#E8FAF2', dark: '#86D9B9', w: '#FFFFFF', b: '#2E6B57' },
  { id: 'matcha', name: 'มัทฉะ', color: 'green', light: '#F1F5DF', dark: '#A8C47A', w: '#FFFDF4', b: '#3F5222' },
  { id: 'lavender', name: 'ลาเวนเดอร์', color: 'purple', light: '#F1EDFF', dark: '#B9AAF5', w: '#FFFFFF', b: '#4A3A8C' },
  { id: 'grape', name: 'องุ่น', color: 'purple', light: '#F5E9FA', dark: '#C78BDB', w: '#FFF9FF', b: '#5B2470' },
  { id: 'honey', name: 'น้ำผึ้ง', color: 'yellow', light: '#FFF7DA', dark: '#FFD36E', w: '#FFFFFF', b: '#8A5A12' },
  { id: 'lemon', name: 'เลมอน', color: 'yellow', light: '#FDFBE1', dark: '#E9DC6A', w: '#FFFFFF', b: '#6B5E0E' },
  { id: 'sky', name: 'ท้องฟ้า', color: 'blue', light: '#E6F4FF', dark: '#8CC7F2', w: '#FFFFFF', b: '#1F4E78' },
  { id: 'soda', name: 'โซดา', color: 'blue', light: '#E4FBFB', dark: '#79D2D6', w: '#FFFFFF', b: '#18575A' },
  { id: 'cocoa', name: 'โกโก้', color: 'brown', light: '#F7E9D7', dark: '#C69B72', w: '#FFF8EE', b: '#4A2E1E' },
  { id: 'classic', name: 'คลาสสิก', color: 'brown', light: '#EEEED2', dark: '#769656', w: '#FFFFFF', b: '#2B2B2B' },
]

export const SET_FILTERS: { id: SetColor | 'all'; label: string; swatch: string }[] = [
  { id: 'all', label: 'ทั้งหมด', swatch: 'conic-gradient(#F7A1BC 0 17%,#86D9B9 0 33%,#B9AAF5 0 50%,#FFD36E 0 67%,#8CC7F2 0 83%,#C69B72 0)' },
  { id: 'pink', label: 'ชมพู', swatch: '#F7A1BC' },
  { id: 'green', label: 'เขียว', swatch: '#86D9B9' },
  { id: 'purple', label: 'ม่วง', swatch: '#B9AAF5' },
  { id: 'yellow', label: 'เหลือง', swatch: '#FFD36E' },
  { id: 'blue', label: 'ฟ้า', swatch: '#8CC7F2' },
  { id: 'brown', label: 'น้ำตาล', swatch: '#C69B72' },
]

export function setById(id: string | null | undefined): BoardSet {
  return SETS.find((s) => s.id === id) ?? SETS[0]
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
  const body = drawPiece(opts.styles?.[base], base, { fill: color === 'w' ? set.w : set.b, ink: INK, color })
  return (
    <svg key={opts.key} viewBox="0 0 45 45" className={opts.className ?? 'piece'} style={opts.style}>
      {FLIPPED[kind] ? cloneElement(body, { transform: 'rotate(180 22.5 22.5)' }) : body}
      {opts.badge !== false && (
        <>
          <circle cx="7.2" cy="7.2" r="5.6" fill="#fff" stroke={INK} strokeWidth="0.9" />
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
          <text
            x="22.5"
            y="21"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="15"
            fontFamily={GLYPH_FONT}
            fill={color === 'w' ? INK : '#FFFFFF'}
            stroke={INK}
            strokeWidth="0.8"
            paintOrder="stroke"
          >
            {'♛' + VS}
          </text>
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
        return pieceSvg(set, color, kind, {
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

/** กระดานตัวอย่าง 4×4 ของชุด: ม้ากับควีนของทั้งสองฝั่ง */
const PREVIEW: Record<number, [Kind, Color]> = { 1: ['N', 'b'], 2: ['Q', 'b'], 13: ['Q', 'w'], 14: ['N', 'w'] }

export function previewCells(set: BoardSet): { bg: string; glyph: string; color: string }[] {
  return Array.from({ length: 16 }, (_, i) => {
    const dark = ((i >> 2) + (i & 3)) % 2 === 1
    const piece = PREVIEW[i]
    return {
      bg: dark ? set.dark : set.light,
      glyph: piece ? GLYPH[piece[0]] + VS : '',
      color: piece ? (piece[1] === 'w' ? set.w : set.b) : 'transparent',
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

export const DEFAULT_PREFS: SetPrefs = { slots: ['sakura', 'mint', 'honey'], active: 0 }

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

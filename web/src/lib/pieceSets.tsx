// ชุดตัวหมากที่ผู้เล่นเลือกได้ ค่าที่เลือกเก็บในเบราว์เซอร์ของแต่ละคน (ไม่ส่งไปเซิร์ฟเวอร์)
//
// เพิ่มชุดจากไฟล์รูปของตัวเอง:
//   1. วางไฟล์ 12 ไฟล์ไว้ที่ web/public/pieces/<ชื่อชุด>/ ตั้งชื่อ wK wQ wR wB wN wP bK bQ bR bB bN bP
//      (เช่น wK.svg) รูปควรเป็นสี่เหลี่ยมจัตุรัสพื้นหลังโปร่งใส
//   2. เพิ่มบรรทัดใน PIECE_SETS ด้านล่าง เช่น
//      { id: 'myset', label: 'ชุดของฉัน', pieces: imageSet('/pieces/myset', 'svg') },

// ไฟล์นี้ไม่มี component (มีแต่ฟังก์ชันวาดตัวหมาก) กฎ fast refresh จึงไม่เกี่ยว
/* oxlint-disable react/only-export-components */

import { useSyncExternalStore, type CSSProperties, type JSX } from 'react'
import { defaultPieces } from 'react-chessboard'
import type { Color } from './protocol'

type PieceRenderer = (props?: { fill?: string; square?: string; svgStyle?: CSSProperties }) => JSX.Element
export type PieceRenderers = Record<string, PieceRenderer>

export interface PieceSet {
  id: string
  label: string
  pieces: PieceRenderers
}

const KINDS = ['K', 'Q', 'R', 'B', 'N', 'P'] as const
type Kind = (typeof KINDS)[number]
const COLORS: Color[] = ['w', 'b']

function buildSet(render: (color: Color, kind: Kind, style: CSSProperties | undefined) => JSX.Element): PieceRenderers {
  const out: PieceRenderers = {}
  for (const color of COLORS) {
    for (const kind of KINDS) {
      out[color + kind] = (props) => render(color, kind, props?.svgStyle)
    }
  }
  return out
}

const SVG_BASE: CSSProperties = { width: '100%', height: '100%', display: 'block' }

/** ตัวอักษรย่อในวงกลม อ่านง่ายบนจอเล็ก */
const letters = buildSet((color, kind, style) => {
  const white = color === 'w'
  return (
    <svg viewBox="0 0 45 45" style={{ ...SVG_BASE, ...style }}>
      <circle
        cx="22.5"
        cy="22.5"
        r="17"
        fill={white ? '#fbfaf5' : '#23212b'}
        stroke={white ? '#23212b' : '#fbfaf5'}
        strokeWidth="1.6"
      />
      <text
        x="22.5"
        y="23.5"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="20"
        fontWeight="700"
        fontFamily="system-ui, 'Segoe UI', Roboto, sans-serif"
        fill={white ? '#23212b' : '#fbfaf5'}
      >
        {kind}
      </text>
    </svg>
  )
})

const GLYPHS: Record<Kind, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' }

/** สัญลักษณ์หมากรุกจากฟอนต์ของเครื่อง ใช้รูปทึบทั้งสองฝั่งแล้วแยกด้วยสี */
const symbols = buildSet((color, kind, style) => {
  const white = color === 'w'
  return (
    <svg viewBox="0 0 45 45" style={{ ...SVG_BASE, ...style }}>
      <text
        x="22.5"
        y="24.5"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="36"
        fontFamily="'Segoe UI Symbol', 'Noto Sans Symbols 2', 'Apple Symbols', 'DejaVu Sans', sans-serif"
        fill={white ? '#fbfaf5' : '#1b1a21'}
        stroke={white ? '#1b1a21' : '#fbfaf5'}
        strokeWidth={white ? 1.3 : 0.7}
        paintOrder="stroke"
        strokeLinejoin="round"
      >
        {/* U+FE0E บังคับให้แสดงเป็นตัวอักษร ไม่ใช่ emoji สี */}
        {GLYPHS[kind] + '︎'}
      </text>
    </svg>
  )
})

/** ชุดตัวหมากจากไฟล์รูปใน web/public (ดูวิธีใช้ที่หัวไฟล์) */
export function imageSet(dir: string, ext: 'svg' | 'png' | 'webp'): PieceRenderers {
  return buildSet((color, kind, style) => (
    <img
      src={`${dir}/${color}${kind}.${ext}`}
      alt=""
      draggable={false}
      style={{ ...SVG_BASE, objectFit: 'contain', ...style }}
    />
  ))
}

export const PIECE_SETS: PieceSet[] = [
  { id: 'classic', label: 'คลาสสิก', pieces: defaultPieces },
  { id: 'symbols', label: 'สัญลักษณ์', pieces: symbols },
  { id: 'letters', label: 'ตัวอักษร', pieces: letters },
]

export const DEFAULT_PIECE_SET = PIECE_SETS[0]

export function pieceSetById(id: string | null): PieceSet {
  return PIECE_SETS.find((s) => s.id === id) ?? DEFAULT_PIECE_SET
}

// ---------- ค่าที่ผู้เล่นเลือก ----------

const STORAGE_KEY = 'checkmate.pieceSet'
const listeners = new Set<() => void>()

function read(): string {
  try {
    return pieceSetById(localStorage.getItem(STORAGE_KEY)).id
  } catch {
    return DEFAULT_PIECE_SET.id // โหมดที่ปิด storage
  }
}

let current: string | null = null

function getSnapshot(): string {
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

export function setPieceSet(id: string): void {
  current = pieceSetById(id).id
  try {
    localStorage.setItem(STORAGE_KEY, current)
  } catch {
    // เก็บไม่ได้ก็ยังใช้ได้จนกว่าจะปิดหน้า
  }
  for (const notify of listeners) notify()
}

/** ชุดตัวหมากที่เลือกอยู่ อัปเดตเองเมื่อเปลี่ยน */
export function usePieceSet(): PieceSet {
  return pieceSetById(useSyncExternalStore(subscribe, getSnapshot))
}

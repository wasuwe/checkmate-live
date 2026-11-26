// เอฟเฟกต์บนกระดาน: ผู้เล่นเลือกได้ว่าจะให้เล่นอะไรเมื่อกินหมาก รุก และรุกฆาต
// เป็นการแสดงผลล้วน ๆ เก็บในเบราว์เซอร์ของแต่ละคน

import { useSyncExternalStore } from 'react'
import type { StateMsg } from './protocol'

export type FxType = 'none' | 'stars' | 'hearts' | 'confetti' | 'bubbles' | 'ring'
export type FxEventKind = 'capture' | 'check' | 'mate'

export const FX_TYPES: { id: FxType; name: string; icon: string; color: string }[] = [
  { id: 'none', name: 'ไม่มี', icon: '–', color: '#3B2F4A' },
  { id: 'stars', name: 'ดาวกระจาย', icon: '★', color: '#FFD36E' },
  { id: 'hearts', name: 'หัวใจลอย', icon: '♥', color: '#FF8FB1' },
  { id: 'confetti', name: 'คอนเฟตตี', icon: '✦', color: '#9FE3C9' },
  { id: 'bubbles', name: 'ฟองสบู่', icon: '◯', color: '#A9D6F7' },
  { id: 'ring', name: 'คลื่นกระแทก', icon: '◎', color: '#C9BDFF' },
]

export const FX_EVENTS: { id: FxEventKind; label: string; desc: string }[] = [
  { id: 'capture', label: 'เมื่อกินหมาก', desc: 'เล่นตรงช่องที่กินได้' },
  { id: 'check', label: 'เมื่อ Check', desc: 'เล่นที่คิงหรือขุนของฝ่ายที่ถูกรุก พร้อมป้าย "Check!" (หมากรุกสากลและหมากรุกไทย)' },
  { id: 'mate', label: 'เมื่อ Checkmate', desc: 'เล่นเต็มกระดานพร้อมป้าย "Checkmate!" และเมื่อชนะบนกระดานในหมากฮอสกับหมากหนีบ' },
]

export type FxPrefs = Record<FxEventKind, FxType>

/**
 * ความอลังการของแต่ละเหตุการณ์ ไล่จากน้อยไปมาก (เจ้าของโปรเจกต์กำหนด): กินหมาก < Check < Checkmate
 * `ms` คือเวลาที่เอฟเฟกต์อยู่บนกระดานก่อนถูกเอาออก
 */
export const FX_LEVEL: Record<FxEventKind, { level: 1 | 2 | 3; ms: number }> = {
  capture: { level: 1, ms: 1900 },
  check: { level: 2, ms: 2600 },
  mate: { level: 3, ms: 5000 },
}

export const DEFAULT_FX: FxPrefs = { capture: 'stars', check: 'ring', mate: 'confetti' }

export function cleanFx(value: unknown): FxPrefs {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const pick = (kind: FxEventKind): FxType =>
    FX_TYPES.some((t) => t.id === raw[kind]) ? (raw[kind] as FxType) : DEFAULT_FX[kind]
  return { capture: pick('capture'), check: pick('check'), mate: pick('mate') }
}

/** จำนวนหมากบนกระดานจาก FEN */
export function pieceCount(fen: string): number {
  return (fen.split(' ')[0].match(/[a-z]/gi) ?? []).length
}

/** เกมจบด้วยการชนะบนกระดาน: รุกจน (หมากรุก) กินหมดหรือปิดจนเดินไม่ได้ (หมากฮอส หมากหนีบ) */
const BOARD_WINS = new Set(['checkmate', 'wipeout', 'blocked'])

export interface FxEvent {
  kind: FxEventKind
  /** ช่องหลักที่เล่นเอฟเฟกต์ หรือ null = กลางกระดาน */
  square: string | null
  /** ช่องของหมากฝ่ายตรงข้ามที่ถูกกินทุกตัวในตานี้ (การกินเล่นที่ช่องเหล่านี้) */
  squares?: string[]
}

/** หมากบนกระดานจาก FEN: ช่อง → ตัวอักษรของหมาก (ตัวพิมพ์ใหญ่ = ขาว) ใช้ได้กับทุกเกมในระบบ */
function boardOf(fen: string): Map<string, string> {
  const out = new Map<string, string>()
  fen
    .split(' ')[0]
    .split('/')
    .forEach((row, r) => {
      let file = 0
      for (const ch of row) {
        if (ch >= '0' && ch <= '9') file += Number(ch)
        else out.set(String.fromCharCode(97 + file++) + (8 - r), ch)
      }
    })
  return out
}

const isWhite = (piece: string) => piece === piece.toUpperCase()

/**
 * ช่องของหมากที่ถูกกินในตาที่เปลี่ยน prev เป็น next: หมากของฝ่ายที่ไม่ได้เดินซึ่งหายไปจากช่องเดิม
 * ครอบคลุมการกินแบบทับช่อง (หมากรุก) กินข้าม (หมากฮอส) กินผ่าน และหนีบหลายตัว (หมากหนีบ)
 */
export function capturedSquares(prev: StateMsg, next: StateMsg): string[] {
  const before = boardOf(prev.fen)
  const after = boardOf(next.fen)
  const moverIsWhite = prev.turn === 'w'
  const out: string[] = []
  for (const [square, piece] of before) {
    if (isWhite(piece) === moverIsWhite) continue
    const now = after.get(square)
    if (now === undefined || isWhite(now) !== isWhite(piece)) out.push(square)
  }
  return out
}

/** ช่องของคิงหรือขุนของฝ่ายที่ถึงตาใน state (ฝ่ายที่ถูกรุกจน) หรือ null ถ้าเกมนั้นไม่มีคิง */
function kingSquare(state: StateMsg): string | null {
  const want = state.turn === 'w' ? 'K' : 'k'
  for (const [square, piece] of boardOf(state.fen)) if (piece === want) return square
  return null
}

/**
 * เหตุการณ์ที่ควรเล่นเอฟเฟกต์เมื่อ state เปลี่ยนจาก prev เป็น next
 * คืน null ถ้าไม่มีตาเดินใหม่ (เช่น state แรกหลังเข้าห้อง หรือแค่มีคนหลุด)
 * `checkedSquare` คือช่องของคิงที่ถูกรุกใน next (คำนวณจากภายนอก)
 * เอฟเฟกต์เกิดที่ตัวของฝ่ายตรงข้ามเสมอ (เจ้าของโปรเจกต์กำหนด): ตัวที่ถูกกิน คิงที่ถูกรุก หรือคิงที่ถูกรุกจน
 */
export function fxEventFor(prev: StateMsg | null, next: StateMsg, checkedSquare: string | null): FxEvent | null {
  if (!prev || next.ply !== prev.ply + 1) return null
  const taken = capturedSquares(prev, next)
  if (next.status === 'finished' && BOARD_WINS.has(next.reason ?? '')) {
    // รุกจน: ที่คิงของผู้แพ้ เกมที่ไม่มีคิง: ที่ตัวสุดท้ายที่ถูกกิน (ถ้าชนะเพราะปิดทางเดิน = กลางกระดาน)
    const square = next.reason === 'checkmate' ? kingSquare(next) : (taken[0] ?? null)
    return { kind: 'mate', square }
  }
  if (checkedSquare) return { kind: 'check', square: checkedSquare }
  if (taken.length > 0) return { kind: 'capture', square: taken[0], squares: taken }
  return null
}

/** ตำแหน่งของช่องบนกระดานเป็นเปอร์เซ็นต์ ตามด้านที่ผู้ดูนั่ง */
export function squarePosition(square: string, flipped: boolean): { left: number; top: number } {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1]) - 1
  const col = flipped ? 7 - file : file
  const row = flipped ? rank : 7 - rank
  return { left: col * 12.5, top: row * 12.5 }
}

/** เลขสุ่มที่ได้ค่าเดิมจาก seed เดิม ทำให้การวาดซ้ำไม่กระโดด */
export function seeded(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

const STORAGE_KEY = 'checkmate.fx'
const listeners = new Set<() => void>()
let current: FxPrefs | null = null

function read(): FxPrefs {
  try {
    return cleanFx(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return DEFAULT_FX
  }
}

function getSnapshot(): FxPrefs {
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

export function setFx(kind: FxEventKind, type: FxType): void {
  current = cleanFx({ ...getSnapshot(), [kind]: type })
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // เก็บไม่ได้ก็ยังใช้ได้จนกว่าจะปิดหน้า
  }
  for (const notify of listeners) notify()
}

export function useFxPrefs(): FxPrefs {
  return useSyncExternalStore(subscribe, getSnapshot)
}

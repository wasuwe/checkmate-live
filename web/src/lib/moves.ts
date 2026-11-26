// ตัวช่วยฝั่งหน้าเว็บสำหรับไฮไลต์และแสดงผลล่วงหน้าเท่านั้น
// เซิร์ฟเวอร์เป็นผู้ตัดสินกติกาจริง ผลจากไฟล์นี้ไม่ถูกเชื่อถือ

import { Chess, type Square } from 'chess.js'
import { gameOf } from './games'
import { checkersApply, checkersPosition } from './checkers'
import { makrukApply, makrukPosition } from './makruk'
import { neebApply, neebPosition } from './neeb'
import type { BoardPosition } from './placement'
import type { Color, GameId, Promo, StateMsg } from './protocol'

function load(fen: string): Chess | null {
  try {
    return new Chess(fen)
  } catch {
    return null
  }
}

/** ช่องที่หมากบน `square` เดินไปได้ในตำแหน่งนี้ */
export function legalTargets(fen: string, square: string): string[] {
  const chess = load(fen)
  if (!chess) return []
  try {
    const moves = chess.moves({ square: square as Square, verbose: true })
    return [...new Set(moves.map((m) => m.to))]
  } catch {
    return []
  }
}

/** ตาเดินนี้เป็นการเลื่อนขั้นเบี้ยหรือไม่ (ต้องถามผู้เล่นว่าจะเลื่อนเป็นอะไร) */
export function isPromotion(fen: string, from: string, to: string): boolean {
  const chess = load(fen)
  if (!chess) return false
  try {
    return chess
      .moves({ square: from as Square, verbose: true })
      .some((m) => m.to === to && m.promotion !== undefined)
  } catch {
    return false
  }
}

/** คืน FEN หลังเดิน หรือ null ถ้าตาเดินผิดกติกา ใช้แสดงผลล่วงหน้าระหว่างรอเซิร์ฟเวอร์ตอบ */
export function applyMove(fen: string, from: string, to: string, promo: Promo): string | null {
  const chess = load(fen)
  if (!chess) return null
  try {
    chess.move({ from, to, promotion: promo || undefined })
    return chess.fen()
  } catch {
    return null
  }
}

/** ช่องของคิงที่กำลังถูกรุก หรือ null ถ้าไม่มี */
export function checkedKingSquare(fen: string): string | null {
  const chess = load(fen)
  if (!chess || !chess.isCheck()) return null
  const turn = chess.turn()
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece && piece.type === 'k' && piece.color === turn) return piece.square
    }
  }
  return null
}

/** สีของหมากจากรหัสของ react-chessboard เช่น "wP" → "w" */
export function pieceColor(pieceType: string): Color | null {
  const c = pieceType[0]
  return c === 'w' || c === 'b' ? c : null
}

// ---------- ตัวช่วยที่เลือกวิธีตามชนิดของเกม ----------
// หมากรุกสากล: คำนวณในหน้าเว็บด้วย chess.js
// หมากรุกไทย หมากฮอส หมากหนีบ: ใช้ตาเดินที่ถูกกติกาและช่องที่ถูกรุกซึ่งเซิร์ฟเวอร์ส่งมากับ state

/** ช่องที่หมากบน `square` เดินไปได้ */
export function targetsFor(state: StateMsg, square: string): string[] {
  if (gameOf(state) === 'chess') return legalTargets(state.fen, square)
  return state.legal?.[square] ?? []
}

/** ต้องถามผู้เล่นว่าจะเลื่อนขั้นเป็นอะไรหรือไม่ (หมากรุกไทยเบี้ยหงายเองโดยไม่ต้องเลือก) */
export function needsPromotion(state: StateMsg, from: string, to: string): boolean {
  return gameOf(state) === 'chess' && isPromotion(state.fen, from, to)
}

/** ตำแหน่งหลังเดิน สำหรับแสดงผลล่วงหน้า หรือ null ถ้าเดินแบบนี้ไม่ได้ */
export function previewFor(state: StateMsg, from: string, to: string, promo: Promo): string | null {
  const game = gameOf(state)
  if (game === 'chess') return applyMove(state.fen, from, to, promo)
  if (!targetsFor(state, from).includes(to)) return null
  if (game === 'checkers') return checkersApply(state.fen, from, to)
  if (game === 'neeb') return neebApply(state.fen, from, to)
  return makrukApply(state.fen, from, to)
}

/**
 * ช่องของขุน/คิงที่ถูกรุกในตำแหน่ง `fen`
 * หมากรุกไทยรู้เฉพาะตำแหน่งที่เซิร์ฟเวอร์ยืนยันแล้ว ตำแหน่งที่แสดงล่วงหน้าจึงยังไม่แสดงการรุก
 */
export function checkSquareFor(state: StateMsg, fen: string): string | null {
  if (gameOf(state) === 'chess') return checkedKingSquare(fen)
  return fen === state.fen ? (state.check ?? null) : null
}

/** ตำแหน่งในรูปที่ react-chessboard รับ */
export function boardPosition(game: GameId, fen: string): string | BoardPosition {
  if (game === 'chess') return fen
  if (game === 'checkers') return checkersPosition(fen)
  if (game === 'neeb') return neebPosition(fen)
  return makrukPosition(fen)
}

/**
 * หมากที่ต้องกินต่อในหมากฮอส: ฝ่ายเดิมยังถึงตา ถูกบังคับกิน และเดินได้เฉพาะหมากที่เพิ่งกินมา
 * หน้าเว็บเลือกหมากตัวนี้ให้เองเพื่อให้กินต่อได้ด้วยการกดช่องปลายทางครั้งเดียว
 */
export function chainSquare(state: StateMsg): string | null {
  if (gameOf(state) !== 'checkers' || !state.forced || !state.lastMove) return null
  const movable = Object.keys(state.legal ?? {})
  return movable.length === 1 && movable[0] === state.lastMove.to ? movable[0] : null
}

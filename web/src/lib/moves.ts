// ตัวช่วยฝั่งหน้าเว็บสำหรับไฮไลต์และแสดงผลล่วงหน้าเท่านั้น
// เซิร์ฟเวอร์เป็นผู้ตัดสินกติกาจริง ผลจากไฟล์นี้ไม่ถูกเชื่อถือ

import { Chess, type Square } from 'chess.js'
import type { Color, Promo } from './protocol'

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

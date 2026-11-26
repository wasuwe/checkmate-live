// เกมที่มีในหน้าเลือกเกม เกมที่เซิร์ฟเวอร์ยังไม่มีกติกาแสดงเป็น "เร็วๆ นี้"

import type { GameId, StateMsg } from './protocol'

export interface GameType {
  id: string
  name: string
  desc: string
  glyph: string
  bg: string
  /** ยังเล่นไม่ได้: เซิร์ฟเวอร์ยังไม่มีกติกาของเกมนี้ */
  soon: boolean
}

export const GAMES: GameType[] = [
  { id: 'chess', name: 'หมากรุกสากล', desc: 'กติกามาตรฐานสากล เล่นได้ทั่วโลก', glyph: '♞', bg: '#FFB8CC', soon: false },
  { id: 'makruk', name: 'หมากรุกไทย', desc: 'เบี้ยเริ่มแถวที่สาม เดินแบบไทยแท้', glyph: '♜', bg: '#9FE3C9', soon: false },
  { id: 'checkers', name: 'หมากฮอส', desc: 'เดินทแยง กินข้ามหัว เข้าฝั่งได้เป็นฮอส', glyph: '●', bg: '#C9BDFF', soon: true },
  { id: 'neeb', name: 'หมากหนีบ', desc: 'เดินแบบเรือ หนีบหมากฝ่ายตรงข้ามไว้ตรงกลางเพื่อกิน', glyph: '◎', bg: '#A9D6F7', soon: true },
]

/** เกมที่เล่นได้จริง (มีกติกาฝั่งเซิร์ฟเวอร์และหน้ากฎ) */
export const PLAYABLE: GameId[] = ['chess', 'makruk']

export function isGameId(value: unknown): value is GameId {
  return PLAYABLE.includes(value as GameId)
}

/** เกมของห้อง เซิร์ฟเวอร์รุ่นก่อนมีหลายเกมไม่ส่งค่านี้มา ซึ่งคือหมากรุกสากล */
export function gameOf(state: Pick<StateMsg, 'game'>): GameId {
  return isGameId(state.game) ? state.game : 'chess'
}

export function gameName(id: GameId): string {
  return GAMES.find((g) => g.id === id)?.name ?? ''
}

/** คำที่ขึ้นบนกระดานเมื่อรุกและเมื่อเกมจบด้วยการรุก */
export function checkWords(id: GameId): { check: string; mate: string } {
  return id === 'makruk' ? { check: 'รุก!', mate: 'รุกจน!' } : { check: 'รุก!', mate: 'รุกฆาต!' }
}

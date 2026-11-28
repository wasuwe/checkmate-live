// เกมที่มีในหน้าเลือกเกม เกมที่ตั้ง soon ไว้จะแสดงเป็น "เร็ว ๆ นี้" และกดไม่ได้ (ตอนนี้เล่นได้ครบทุกเกม)

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
  { id: 'chess', name: 'หมากรุกสากล', desc: 'หมากรุกแบบที่เล่นกันทั่วโลก', glyph: '♞', bg: '#F3D6DE', soon: false },
  { id: 'makruk', name: 'หมากรุกไทย', desc: 'หมากรุกแบบไทย เบี้ยตั้งที่แถวสาม', glyph: '♜', bg: '#D3EADF', soon: false },
  { id: 'checkers', name: 'หมากฮอส', desc: 'เดินทแยง กินข้ามหัว เข้าฝั่งได้เป็นฮอส', glyph: '●', bg: '#DED8F5', soon: false },
  { id: 'neeb', name: 'หมากหนีบ', desc: 'เดินแบบเรือ หนีบหมากอีกฝ่ายไว้ตรงกลางแล้วกิน', glyph: '◎', bg: '#D5E6F5', soon: false },
]

/** เกมที่เล่นได้จริง (มีกติกาฝั่งเซิร์ฟเวอร์และหน้ากฎ) */
export const PLAYABLE: GameId[] = ['chess', 'makruk', 'checkers', 'neeb']

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

/** คำที่ขึ้นบนกระดานเมื่อรุก และเมื่อเกมจบบนกระดาน (รุกจน กินหมด หรือปิดจนเดินไม่ได้) */
export function checkWords(id: GameId): { check: string; mate: string } {
  // เจ้าของโปรเจกต์ให้ใช้คำภาษาอังกฤษกับการรุกทั้งหมากรุกสากลและหมากรุกไทย
  if (id === 'makruk' || id === 'chess') return { check: 'Check!', mate: 'Checkmate!' }
  return { check: '', mate: 'จบเกม!' }
}

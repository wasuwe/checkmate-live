import type { Color, StateMsg } from './protocol'

export interface Absence {
  color: Color
  /** วินาทีที่เหลือก่อนถูกปรับแพ้ */
  secondsLeft: number
}

/**
 * ผู้เล่นที่หลุดอยู่ระหว่างเกม พร้อมเวลาที่เหลือ ณ ตอน `now`
 * เซิร์ฟเวอร์ส่งเวลาที่เหลือมาตอน `stateAt` หน้าเว็บนับต่อเองเพื่อแสดงผลเท่านั้น
 * การตัดสินแพ้ชนะยังเป็นของเซิร์ฟเวอร์
 */
export function absences(state: StateMsg, stateAt: number, now: number): Absence[] {
  if (state.status !== 'playing' || !state.players) return []
  const elapsed = Math.max(0, Math.floor((now - stateAt) / 1000))
  const out: Absence[] = []
  for (const color of ['w', 'b'] as const) {
    const player = state.players[color]
    if (player && !player.connected) {
      out.push({ color, secondsLeft: Math.max(0, (player.graceLeft ?? 0) - elapsed) })
    }
  }
  return out
}

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

/** จำนวนคนอื่นที่อยู่ในห้องตอนนี้: ผู้เล่นคนอื่นที่เชื่อมต่ออยู่ (ที่นั่งในห้องรอ หรือฝั่งในเกม) รวมกับผู้ชม */
function othersPresent(state: StateMsg): number {
  const seated = state.lobby
    ? state.lobby.seats.filter((s) => !s.you && s.connected).length
    : Object.entries(state.players ?? {}).filter(([color, p]) => color !== state.you.color && p.connected).length
  return seated + (state.watching ?? 0)
}

/**
 * มีคนเพิ่งเข้าห้องหรือไม่ (เทียบกับ state ก่อนหน้า): คู่แข่งเข้ามานั่ง ผู้ชมเข้ามาดู หรือคนที่หลุดกลับเข้ามา
 * ใช้เล่นเสียงประตูกับกระดิ่ง ไม่นับ state แรกหลังเราเข้าห้องเอง และไม่นับการย้ายที่ของคนเดิม
 * (เช่น ห้องรอกลายเป็นเกม หรือคนที่ถูกเชิญออกจากที่นั่งกลายเป็นผู้ชม)
 */
export function someoneArrived(prev: StateMsg | null, next: StateMsg): boolean {
  return prev !== null && othersPresent(next) > othersPresent(prev)
}

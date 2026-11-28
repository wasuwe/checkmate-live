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

/** สิ่งที่ต้องจำระหว่าง state เพื่อตัดสินว่าจะสั่นกระดิ่งหรือไม่ (เวลาเป็น ms) */
export interface DoorMemory {
  /** ครั้งล่าสุดที่มีคนออกจากห้องหรือหลุด */
  leftAt: number
  /** ครั้งล่าสุดที่กระดิ่งดัง */
  rangAt: number
}

export const newDoorMemory = (): DoorMemory => ({ leftAt: -Infinity, rangAt: -Infinity })

/** มีคนเข้าหลังจากมีคนออกไม่เกินเท่านี้ ถือว่าเป็นคนเดิมที่หลุดแล้วต่อกลับมา หรือกดโหลดหน้าใหม่ */
export const SAME_PERSON_MS = 20_000
/** กระดิ่งดังห่างกันอย่างน้อยเท่านี้ */
export const DOOR_GAP_MS = 3_000

/**
 * ควรเล่นเสียงประตูกับกระดิ่งสำหรับ state นี้หรือไม่ (เทียบกับ state ก่อนหน้า) และจดสิ่งที่เกิดลงใน `memory`
 * ดังเมื่อมีคนอื่นเข้าห้องเพิ่ม: คู่แข่งมานั่ง หรือผู้ชมเข้ามาดู
 * ไม่ดัง: state แรกหลังเราเข้าห้องเอง การย้ายที่ของคนเดิม (ห้องรอกลายเป็นเกม คนที่ถูกเชิญออกกลายเป็นผู้ชม)
 * และคนที่เพิ่งหลุดแล้วกลับมา ซึ่งถ้าไม่กันไว้ คนที่เน็ตไม่นิ่งจะทำให้กระดิ่งดังซ้ำไปเรื่อย ๆ ทุกครั้งที่ต่อกลับมา
 */
export function doorShouldRing(prev: StateMsg | null, next: StateMsg, memory: DoorMemory, now: number): boolean {
  if (prev === null) return false
  const before = othersPresent(prev)
  const after = othersPresent(next)
  if (after < before) memory.leftAt = now
  if (after <= before) return false
  if (now - memory.leftAt < SAME_PERSON_MS || now - memory.rangAt < DOOR_GAP_MS) return false
  memory.rangAt = now
  return true
}

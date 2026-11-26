// การโยนเหรียญหาคนเริ่มก่อนตอนเริ่มเกม
// ผลถูกสุ่มที่เซิร์ฟเวอร์แล้ว (การสุ่มที่นั่ง: ฝั่งขาวเดินก่อน) หน้าเว็บแค่เล่นภาพเหรียญให้ตกตามผลนั้น
// เซิร์ฟเวอร์ยังไม่เริ่มนับนาฬิการะหว่างนี้ (clock.delay) การโยนเหรียญจึงไม่กินเวลาของใคร

import type { StateMsg } from './protocol'
import { colorName, playerName } from './text'

/** ถ้าเหลือเวลาก่อนนาฬิกาเริ่มน้อยกว่านี้ (เข้าห้องมาช้า) ไม่เล่นภาพ */
export const TOSS_MIN_MS = 1500

/** เวลาของภาพทั้งหมด: ดีดและหมุน โคลงเคลง แล้วหยุดให้เห็นผล */
export const TOSS_TOTAL_MS = 3300

export interface TossView {
  /** ข้อความบนเหรียญสองด้าน */
  front: string
  back: string
  /** ด้านที่หงายขึ้นเมื่อเหรียญหยุด */
  landsOn: 'front' | 'back'
  /** ข้อความบอกผล */
  result: string
}

/** ควรเล่นภาพโยนเหรียญสำหรับ state นี้หรือไม่: เกมเพิ่งเริ่ม ยังไม่มีใครเดิน และนาฬิกายังรอเริ่มอยู่ */
export function shouldToss(state: StateMsg): boolean {
  return state.status === 'playing' && state.ply === 0 && (state.clock.delay ?? 0) >= TOSS_MIN_MS
}

/**
 * สิ่งที่แสดงบนเหรียญ ผู้เล่นเห็นด้าน "คุณ" กับ "คู่แข่ง" ผู้ชมเห็นด้าน "ขาว" กับ "ดำ"
 * ฝ่ายที่เดินก่อนคือฝ่ายที่ถึงตาใน state แรกของเกม
 */
export function tossView(state: StateMsg): TossView {
  const first = state.turn
  const you = state.you.color
  if (you === '') {
    const name = playerName(state.players?.[first], first)
    return {
      front: colorName('w'),
      back: colorName('b'),
      landsOn: first === 'w' ? 'front' : 'back',
      result: `ฝ่าย${colorName(first)} (${name}) ได้เริ่มก่อน`,
    }
  }
  const mine = you === first
  return {
    front: 'คุณ',
    back: 'คู่แข่ง',
    landsOn: mine ? 'front' : 'back',
    result: mine ? 'คุณได้เริ่มก่อน!' : 'คู่แข่งได้เริ่มก่อน',
  }
}

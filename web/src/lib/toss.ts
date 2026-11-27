// การโยนเหรียญตอนเริ่มเกม: สุ่มฝ่ายขาว–ดำ (หมากรุก) หรือหาคนเริ่มก่อน (หมากฮอส หมากหนีบ)
// ผลถูกสุ่มที่เซิร์ฟเวอร์แล้ว (การสุ่มที่นั่ง: ฝั่งขาวเดินก่อน) หน้าเว็บแค่เล่นภาพเหรียญให้ตกตามผลนั้น
// เซิร์ฟเวอร์ยังไม่เริ่มนับนาฬิการะหว่างนี้ (clock.delay) การโยนเหรียญจึงไม่กินเวลาของใคร

import { gameOf } from './games'
import type { Color, StateMsg } from './protocol'
import { colorName, playerName } from './text'

/** ถ้าเหลือเวลาก่อนนาฬิกาเริ่มน้อยกว่านี้ (เข้าห้องมาช้า) ไม่เล่นภาพ */
export const TOSS_MIN_MS = 1500

/** เวลาของภาพทั้งหมด: ดีดและหมุน โคลงเคลง แล้วหยุดให้เห็นผล */
export const TOSS_TOTAL_MS = 3300

export interface TossView {
  /** หัวข้อเหนือเหรียญ */
  title: string
  /** หน้าตาของเหรียญ: 'sides' = เหรียญทองกับเงิน (คุณ/คู่แข่ง), 'colors' = ด้านขาวกับด้านดำ */
  faces: 'sides' | 'colors'
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
 * สิ่งที่แสดงบนเหรียญ
 * หมากรุกสากลและหมากรุกไทย (เจ้าของโปรเจกต์กำหนด): เป็นการสุ่มฝ่ายขาว–ดำ ไม่ใช่สุ่มว่าใครเริ่มก่อน
 * เหรียญมีด้านขาวกับด้านดำ ตกที่สีของผู้ดู (ผู้ชมเห็นว่าใครได้สีไหน)
 * หมากฮอสและหมากหนีบ: โยนหาคนเริ่มก่อน ผู้เล่นเห็นด้าน "คุณ" กับ "คู่แข่ง" ผู้ชมเห็นด้าน "ขาว" กับ "ดำ"
 * ฝ่ายที่เดินก่อนคือฝ่ายที่ถึงตาใน state แรกของเกม
 */
export function tossView(state: StateMsg): TossView {
  const first = state.turn
  const you = state.you.color
  const game = gameOf(state)
  if (game === 'chess' || game === 'makruk') {
    const base = { title: 'สุ่มฝ่ายขาว–ดำ', faces: 'colors', front: colorName('w'), back: colorName('b') } as const
    if (you === '') {
      const name = (c: Color) => playerName(state.players?.[c], c)
      return { ...base, landsOn: 'front', result: 'ขาว: ' + name('w') + ' · ดำ: ' + name('b') }
    }
    const order = you === first ? 'เดินก่อน' : 'เดินทีหลัง'
    return { ...base, landsOn: you === 'w' ? 'front' : 'back', result: 'คุณได้ฝ่าย' + colorName(you) + ' ' + order }
  }
  const base = { title: 'โยนเหรียญหาคนเริ่มก่อน', faces: 'sides' } as const
  if (you === '') {
    const name = playerName(state.players?.[first], first)
    return {
      ...base,
      front: colorName('w'),
      back: colorName('b'),
      landsOn: first === 'w' ? 'front' : 'back',
      result: 'ฝ่าย' + colorName(first) + ' (' + name + ') ได้เริ่มก่อน',
    }
  }
  const mine = you === first
  return {
    ...base,
    front: 'คุณ',
    back: 'คู่แข่ง',
    landsOn: mine ? 'front' : 'back',
    result: mine ? 'คุณได้เริ่มก่อน!' : 'คู่แข่งได้เริ่มก่อน',
  }
}

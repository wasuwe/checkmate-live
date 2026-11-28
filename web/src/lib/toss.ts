// การโยนเหรียญตอนเริ่มเกม: สุ่มฝ่ายขาว–ดำ (หมากรุก) หรือหาคนเริ่มก่อน (หมากฮอส หมากหนีบ)
// ผลถูกสุ่มที่เซิร์ฟเวอร์แล้ว (การสุ่มที่นั่ง: ฝั่งขาวเดินก่อน) หน้าเว็บแค่เล่นภาพเหรียญให้ตกตามผลนั้น
// เซิร์ฟเวอร์ยังไม่เริ่มนับนาฬิการะหว่างนี้ (clock.delay) การโยนเหรียญจึงไม่กินเวลาของใคร

import { gameOf } from './games'
import type { Color, StateMsg } from './protocol'
import { colorName, playerName } from './text'

/** ถ้าเหลือเวลาก่อนนาฬิกาเริ่มน้อยกว่านี้ (เข้าห้องมาช้า) ไม่เล่นภาพ */
export const TOSS_MIN_MS = 1500

/**
 * เวลาของภาพทั้งหมด: หนังสือนิทานเปิด (ราว 1.2 วินาที) เหรียญดีด หมุน โคลงเคลง แล้วหยุดให้เห็นผล แล้วพุ่งเข้าไปในหนังสือ
 * ต้องไม่เกินเวลาที่เซิร์ฟเวอร์รอก่อนเริ่มนาฬิกา (START_DELAY ค่าเริ่มต้น 5 วินาที)
 */
export const TOSS_TOTAL_MS = 4800

/** หน้าหนึ่งของหนังสือนิทานในฉากเปิดเกม: ผู้เล่นหนึ่งฝั่ง */
export interface TossPage {
  color: Color
  /** ชื่อผู้เล่น */
  name: string
  /** ผู้ที่ดูอยู่คือผู้เล่นฝั่งนี้ */
  you: boolean
  /** รหัสชุดหมากรุกที่ฝั่งนี้เลือกในห้องรอ (ไม่มี = ใช้ชุดของผู้ดู) */
  set?: string
  /** ข้อความบนริบบิ้นที่ขึ้นเมื่อเหรียญหยุด เช่น "ฝ่ายขาว เดินก่อน" */
  ribbon: string
}

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
  /** หน้าซ้ายและหน้าขวาของหนังสือ: ผู้เล่นเห็นตัวเองอยู่หน้าซ้าย ผู้ชมเห็นฝ่ายขาวอยู่หน้าซ้าย */
  pages: [TossPage, TossPage]
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
  const colors = game === 'chess' || game === 'makruk'
  const page = (color: Color): TossPage => ({
    color,
    name: playerName(state.players?.[color], color),
    you: you === color,
    set: state.players?.[color]?.set,
    ribbon: colors
      ? 'ฝ่าย' + colorName(color) + (color === first ? ' เดินก่อน' : '')
      : color === first
        ? 'เดินก่อน'
        : 'เดินทีหลัง',
  })
  const pages: [TossPage, TossPage] = you === 'b' ? [page('b'), page('w')] : [page('w'), page('b')]
  if (colors) {
    const base = { title: 'สุ่มฝ่ายขาวดำ', faces: 'colors', front: colorName('w'), back: colorName('b'), pages } as const
    if (you === '') {
      const name = (c: Color) => playerName(state.players?.[c], c)
      return { ...base, landsOn: 'front', result: name('w') + ' ได้ฝ่ายขาว ' + name('b') + ' ได้ฝ่ายดำ' }
    }
    const order = you === first ? 'เดินก่อน' : 'เดินทีหลัง'
    return { ...base, landsOn: you === 'w' ? 'front' : 'back', result: 'คุณได้ฝ่าย' + colorName(you) + ' ' + order }
  }
  const base = { title: 'โยนเหรียญหาคนเดินก่อน', faces: 'sides', pages } as const
  if (you === '') {
    const name = playerName(state.players?.[first], first)
    return {
      ...base,
      front: colorName('w'),
      back: colorName('b'),
      landsOn: first === 'w' ? 'front' : 'back',
      result: 'ฝ่าย' + colorName(first) + ' (' + name + ') ได้เดินก่อน',
    }
  }
  const mine = you === first
  return {
    ...base,
    front: 'คุณ',
    back: 'คู่แข่ง',
    landsOn: mine ? 'front' : 'back',
    result: mine ? 'คุณได้เดินก่อน!' : 'คู่แข่งได้เดินก่อน',
  }
}

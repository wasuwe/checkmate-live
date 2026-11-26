// แสดงนาฬิกาจากค่าที่เซิร์ฟเวอร์ส่งมา หน้าเว็บนับต่อเองเพื่อแสดงผลเท่านั้น
// การตัดสินหมดเวลาเป็นของเซิร์ฟเวอร์

import type { Color, StateMsg } from './protocol'

/** เวลาที่เหลือ (ms) ของแต่ละฝั่ง ณ ตอน `now` โดยนับต่อจาก state ที่ได้รับตอน `stateAt` */
export function clockAt(state: StateMsg, stateAt: number, now: number): Record<Color, number> {
  // ช่วงโยนเหรียญตอนเริ่มเกม นาฬิกายังไม่นับจนกว่าจะพ้น delay
  const elapsed = Math.max(0, now - stateAt - (state.clock.delay ?? 0))
  const left = (color: Color) =>
    Math.max(0, state.clock[color] - (state.clock.running === color ? elapsed : 0))
  return { w: left('w'), b: left('b') }
}

/** ต่ำกว่านี้ถือว่าเวลาใกล้หมด: แสดงทศนิยมและเปลี่ยนสี */
export const LOW_TIME_MS = 10_000

/** "9:59", "0:10" และเมื่อต่ำกว่า 10 วินาทีแสดงทศนิยม เช่น "0:09.4" */
export function formatClock(ms: number): string {
  if (ms <= 0) return '0:00.0'
  if (ms < LOW_TIME_MS) {
    const tenths = Math.floor(ms / 100)
    return `0:0${Math.floor(tenths / 10)}.${tenths % 10}`
  }
  // ปัดขึ้นเป็นวินาที เพื่อให้เวลาเริ่มต้น 10:00 แสดงเป็น 10:00 ไม่ใช่ 9:59
  const total = Math.ceil(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export interface TimeControlOption {
  value: string
  label: string
  hint: string
}

/** เวลาเล่นที่ให้เลือกตอนสร้างห้อง (นาทีต่อฝั่ง + วินาทีที่บวกหลังเดินแต่ละตา) */
export const TIME_CONTROLS: TimeControlOption[] = [
  { value: '5+3', label: '5 นาที + 3 วิ', hint: 'เร็ว' },
  { value: '10+0', label: '10 นาที', hint: 'มาตรฐาน' },
  { value: '15+10', label: '15 นาที + 10 วิ', hint: 'คิดนาน' },
]

export const DEFAULT_TIME_CONTROL = '10+0'

/** "5+3" → "5 นาที +3 วินาทีต่อตา" */
export function describeTimeControl(tc: string): string {
  const match = /^(\d+)\+(\d+)$/.exec(tc)
  if (!match) return tc
  const [, minutes, increment] = match
  return increment === '0' ? `${minutes} นาที` : `${minutes} นาที +${increment} วินาทีต่อตา`
}

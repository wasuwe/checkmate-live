// ห้องรอก่อนเกม: ผู้เล่นสองคนนั่งรอ แชทได้ และต้องกด "พร้อม" ทั้งคู่ จากนั้นเซิร์ฟเวอร์นับถอยหลังแล้วเริ่มเกม
// เซิร์ฟเวอร์เป็นผู้ตัดสินทั้งหมด (ใครนั่ง ใครพร้อม เริ่มเมื่อไหร่) หน้าเว็บแค่แสดงผลและส่งคำสั่ง ready

import type { Color, LobbyInfo, LobbySeat, PlayerInfo, StateMsg } from './protocol'
import { colorName } from './text'

export const GUEST_LABEL = 'ผู้เล่นรับเชิญ'

/** ชื่อที่แสดงของที่นั่งในห้องรอ */
export function seatName(seat: Pick<LobbySeat, 'name' | 'guest' | 'you'>): string {
  const name = seat.name || (seat.guest ? GUEST_LABEL : 'ผู้เล่น')
  return seat.you ? `${name} (คุณ)` : name
}

export type SeatStatus = 'empty' | 'away' | 'ready' | 'waiting'

/** สถานะของที่นั่ง: ว่าง หลุดการเชื่อมต่อ พร้อมแล้ว หรือยังไม่พร้อม */
export function seatStatus(seat: LobbySeat | undefined): SeatStatus {
  if (!seat) return 'empty'
  if (!seat.connected) return 'away'
  return seat.ready ? 'ready' : 'waiting'
}

export const SEAT_STATUS_TEXT: Record<SeatStatus, string> = {
  empty: 'รอผู้เล่น…',
  away: 'หลุดอยู่',
  ready: 'พร้อมแล้ว',
  waiting: 'ยังไม่พร้อม',
}

/** ที่นั่งของผู้ที่ดูหน้าจออยู่ หรือ undefined ถ้าเป็นผู้ชม */
export function mySeat(lobby: LobbyInfo): LobbySeat | undefined {
  return lobby.seats.find((s) => s.you)
}

/**
 * วินาทีที่เหลือก่อนเกมเริ่ม (ปัดขึ้น) หรือ null ถ้ายังไม่ได้นับถอยหลัง
 * `stateAt` คือเวลาที่ได้รับ state และ `now` คือเวลาปัจจุบัน หน้าเว็บนับต่อเองเพื่อแสดงผลเท่านั้น
 */
export function countdownSeconds(lobby: LobbyInfo, stateAt: number, now: number): number | null {
  if (!lobby.countdown) return null
  const left = lobby.countdown - Math.max(0, now - stateAt)
  return Math.max(1, Math.ceil(left / 1000))
}

/** ข้อความบอกว่าตอนนี้รออะไรอยู่ */
export function lobbyHint(lobby: LobbyInfo): string {
  const me = mySeat(lobby)
  const others = lobby.seats.filter((s) => !s.you)
  if (lobby.countdown) return 'ทุกคนพร้อมแล้ว เกมกำลังจะเริ่ม'
  if (lobby.removed) return 'เจ้าของห้องเชิญคุณออกจากที่นั่ง คุณยังดูเกมนี้ได้'
  if (lobby.seats.length < 2) return me ? 'ส่งรหัสหรือลิงก์ให้เพื่อน แล้วรอเพื่อนเข้าห้อง' : 'รอผู้เล่นเข้าห้อง'
  if (!me) return 'คุณเป็นผู้ชม เกมจะเริ่มเมื่อผู้เล่นทั้งสองกดพร้อม'
  if (others.some((s) => !s.connected)) return 'คู่แข่งหลุดไป รอสักครู่'
  if (!me.ready) return others.every((s) => s.ready) ? 'คู่แข่งพร้อมแล้ว กดพร้อมเพื่อเริ่มเกม' : 'พร้อมแล้วกดปุ่มพร้อมได้เลย'
  return 'รอคู่แข่งกดพร้อม'
}

/**
 * ชื่อของผู้ส่งแชทตามเลขประจำตัวในห้อง (sender) ใช้ใส่ชื่อให้ข้อความ ทั้งในห้องรอและระหว่างเกม
 * ระหว่างเกมมีสีกำกับด้วย เพื่อให้รู้ว่าเป็นผู้เล่นฝั่งไหน
 */
export function chatNames(state: Pick<StateMsg, 'lobby' | 'players'>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const seat of state.lobby?.seats ?? []) {
    if (seat.sender) out[seat.sender] = seat.name || (seat.guest ? GUEST_LABEL : 'ผู้เล่น')
  }
  for (const color of ['w', 'b'] as Color[]) {
    const p: PlayerInfo | undefined = state.players?.[color]
    if (p?.sender) out[p.sender] = p.name ? `${p.name} (${colorName(color)})` : colorName(color)
  }
  return out
}

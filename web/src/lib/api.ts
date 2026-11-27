// เรียก HTTP API ของ Go server

import type { GameId } from './protocol'
import { getToken } from './session'

/** fetch ที่แนบ token ของผู้ใช้ ถ้าเซิร์ฟเวอร์ตอบ 401 จะขอ token ใหม่แล้วลองอีกครั้งเดียว */
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response | undefined
  for (const forceNew of [false, true]) {
    const token = await getToken(forceNew)
    res = await fetch(path, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
    })
    if (res.status !== 401) break // 401 = token เก่าใช้ไม่ได้แล้ว
  }
  return res as Response
}

/** สร้างห้องใหม่ของเกมและเวลาเล่นที่เลือก (เช่น "10+0") คืนรหัสห้อง */
export async function createRoom(timeControl: string, game: GameId = 'chess'): Promise<string> {
  const res = await authedFetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeControl, game }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new CreateRoomError(body.error ?? '')
  }
  const body = (await res.json()) as { roomId: string }
  return body.roomId
}

/**
 * ถามเซิร์ฟเวอร์ว่ามีห้องรหัสนี้เปิดอยู่หรือไม่ ใช้ที่หน้าแรกก่อนพาเข้าห้อง
 * 'limited' = ถามถี่เกินไป, 'unknown' = ถามไม่สำเร็จ (เช่น เน็ตหลุด) ผู้เรียกควรพาเข้าห้องไปตามเดิม
 */
export async function roomExists(roomId: string): Promise<'yes' | 'no' | 'limited' | 'unknown'> {
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`)
    if (res.ok) return 'yes'
    if (res.status === 404) return 'no'
    if (res.status === 429) return 'limited'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

const CREATE_ROOM_ERRORS: Record<string, string> = {
  too_many_rooms: 'คุณมีห้องที่ยังเล่นไม่จบค้างอยู่หลายห้อง เล่นให้จบหรือรอสักครู่ก่อนสร้างห้องใหม่',
  rate_limited: 'สร้างห้องถี่เกินไป รอสักครู่แล้วลองใหม่',
  server_full: 'ตอนนี้ห้องเต็มทั้งระบบ ลองใหม่ภายหลัง',
}

/** สร้างห้องไม่สำเร็จ message เป็นข้อความที่แสดงให้ผู้ใช้ได้เลย */
export class CreateRoomError extends Error {
  constructor(code: string) {
    super(CREATE_ROOM_ERRORS[code] ?? 'สร้างห้องไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่')
  }
}

export function socketUrl(): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${location.host}/ws`
}

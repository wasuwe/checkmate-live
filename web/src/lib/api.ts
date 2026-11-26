// เรียก HTTP API ของ Go server

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

/** สร้างห้องใหม่ด้วยเวลาเล่นที่เลือก (เช่น "10+0") คืนรหัสห้อง */
export async function createRoom(timeControl: string): Promise<string> {
  const res = await authedFetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeControl }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new CreateRoomError(body.error ?? '')
  }
  const body = (await res.json()) as { roomId: string }
  return body.roomId
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

// เรียก HTTP API ของ Go server

import { getToken } from './session'

/** สร้างห้องใหม่ด้วยเวลาเล่นที่เลือก (เช่น "10+0") คืนรหัสห้อง */
export async function createRoom(timeControl: string): Promise<string> {
  for (const forceNew of [false, true]) {
    const token = await getToken(forceNew)
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeControl }),
    })
    if (res.status === 401 && !forceNew) continue // token เก่าใช้ไม่ได้แล้ว ลองใหม่ด้วย token ใหม่
    if (!res.ok) throw new Error(`create room failed: ${res.status}`)
    const body = (await res.json()) as { roomId: string }
    return body.roomId
  }
  throw new Error('create room failed: unauthorized')
}

export function socketUrl(): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${location.host}/ws`
}

// รูปแบบข้อความ WebSocket ต้องตรงกับ server/internal/hub/protocol.go

export type Color = 'w' | 'b'
export type RoomStatus = 'waiting' | 'playing' | 'finished'
export type Role = 'player' | 'spectator'
export type Promo = '' | 'q' | 'r' | 'b' | 'n'

export interface StateMsg {
  type: 'state'
  room: string
  status: RoomStatus
  fen: string
  turn: Color
  /** จำนวนตาเดิน (ครึ่งตา) ที่เล่นไปแล้ว ต้องส่งกลับไปกับ move เพื่อกันตาเดินเก่า */
  ply: number
  lastMove?: { from: string; to: string }
  players?: Partial<Record<Color, { connected: boolean }>>
  you: { role: Role; color: Color | '' }
  result?: string
  reason?: string
}

export interface AuthOkMsg {
  type: 'auth_ok'
  userId: string
}

export interface GameOverMsg {
  type: 'game_over'
  result: string
  reason: string
}

export interface ErrorMsg {
  type: 'error'
  code: string
}

export type ServerMsg = StateMsg | AuthOkMsg | GameOverMsg | ErrorMsg

export type ClientMsg =
  | { type: 'auth'; token: string }
  | { type: 'join'; room: string }
  | { type: 'move'; ply: number; from: string; to: string; promo: Promo }

const SERVER_TYPES = new Set(['state', 'auth_ok', 'game_over', 'error'])

/** แปลงข้อความจากเซิร์ฟเวอร์ คืน null ถ้าไม่ใช่รูปแบบที่รู้จัก */
export function parseServerMsg(data: string): ServerMsg | null {
  let value: unknown
  try {
    value = JSON.parse(data)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const type = (value as { type?: unknown }).type
  if (typeof type !== 'string' || !SERVER_TYPES.has(type)) return null
  return value as ServerMsg
}

/** รหัสห้อง: 12 ตัวจากชุดอักษรที่ไม่มีตัวสับสน (ไม่มี 0, 1, l, o) */
const ROOM_ID = /^[a-z2-9]{12}$/
const ROOM_ID_IN_TEXT = /(?:^|[^a-z0-9])([a-z2-9]{12})(?:$|[^a-z0-9])/

export function isRoomId(value: string): boolean {
  return ROOM_ID.test(value)
}

/** ดึงรหัสห้องจากสิ่งที่ผู้ใช้วาง ซึ่งอาจเป็นรหัสล้วนหรือทั้งลิงก์ */
export function extractRoomId(input: string): string | null {
  const text = input.trim().toLowerCase()
  if (isRoomId(text)) return text
  return ROOM_ID_IN_TEXT.exec(text)?.[1] ?? null
}

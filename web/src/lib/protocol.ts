// รูปแบบข้อความ WebSocket ต้องตรงกับ server/internal/hub/protocol.go

export type Color = 'w' | 'b'
export type RoomStatus = 'waiting' | 'playing' | 'finished'
export type Role = 'player' | 'spectator'
export type Promo = '' | 'q' | 'r' | 'b' | 'n'
/** ชนิดของเกมที่เซิร์ฟเวอร์มีกติกา */
export type GameId = 'chess' | 'makruk' | 'checkers' | 'neeb'

/** การนับศักดิ์ของหมากรุกไทยที่กำลังเดินอยู่ */
export interface CountInfo {
  kind: 'board' | 'pieces'
  /** เลขที่นับถึงแล้ว และจำนวนที่ต้องนับ */
  n: number
  limit: number
  /** ฝ่ายที่เป็นผู้นับ (มีเฉพาะนับศักดิ์หมาก) */
  side?: Color
}

export interface PlayerInfo {
  connected: boolean
  /** วินาทีที่ผู้เล่นซึ่งหลุดอยู่ยังกลับเข้ามาได้ก่อนถูกปรับแพ้ (มีเฉพาะตอนหลุด) */
  graceLeft?: number
  /** ชื่อและรหัสรูปจากโปรไฟล์ (ไม่มีถ้าไม่ได้ตั้ง) */
  name?: string
  avatar?: string
  /** ผู้เล่นที่ไม่ได้ login */
  guest?: boolean
  /** เลขประจำตัวในแชทของผู้เล่นคนนี้ ใช้ใส่ชื่อให้ข้อความแชท */
  sender?: string
  /** รหัสชุดหมากรุกที่ผู้เล่นคนนี้เลือกในห้องรอ ครึ่งกระดานและตัวหมากของฝั่งนี้วาดด้วยชุดนี้ (ไม่มี = ไม่ได้เลือก) */
  set?: string
}

/** ผู้ชมหนึ่งคนที่กำลังเปิดห้องอยู่ */
export interface SpectatorInfo {
  name?: string
  avatar?: string
  guest?: boolean
}

/** ที่นั่งหนึ่งที่ในห้องรอ (ยังไม่มีสี สีถูกสุ่มตอนเริ่มเกม) */
export interface LobbySeat {
  name?: string
  avatar?: string
  guest?: boolean
  connected: boolean
  ready: boolean
  /** ที่นั่งของผู้ที่ดูหน้าจอนี้ */
  you?: boolean
  sender?: string
  /** ที่นั่งของเจ้าของห้อง */
  host?: boolean
}

/** สถานะของห้องรอ มีเฉพาะตอนรอเริ่มเกม */
export interface LobbyInfo {
  seats: LobbySeat[]
  /** ms ที่เหลือก่อนเกมเริ่ม ณ ตอนที่เซิร์ฟเวอร์ส่ง (มีเฉพาะตอนทุกคนพร้อมแล้ว) */
  countdown?: number
  /** ผู้ที่ดูหน้าจอนี้เป็นเจ้าของห้อง และมีผู้เล่นอีกคนที่เชิญออกจากที่นั่งได้ */
  canKick?: boolean
  /** ผู้ที่ดูหน้าจอนี้ถูกเจ้าของห้องเชิญออกจากที่นั่งแล้ว (ยังดูเกมได้) */
  removed?: boolean
}

export interface StateMsg {
  type: 'state'
  room: string
  status: RoomStatus
  /** ชนิดของเกม ไม่มี = หมากรุกสากล */
  game?: GameId
  fen: string
  turn: Color
  /** จำนวนตาเดิน (ครึ่งตา) ที่เล่นไปแล้ว ต้องส่งกลับไปกับ move เพื่อกันตาเดินเก่า */
  ply: number
  lastMove?: { from: string; to: string }
  players?: Partial<Record<Color, PlayerInfo>>
  you: { role: Role; color: Color | '' }
  /** เวลาเล่น เช่น "10+0" (นาที+วินาทีที่บวกต่อตา) หรือ "none" = ไม่จับเวลา (ค่าใน clock ไม่มีความหมาย) */
  tc: string
  /** เวลาที่เหลือ (ms) ณ ตอนที่เซิร์ฟเวอร์ส่ง และฝั่งที่นาฬิกากำลังเดิน ('' = หยุด) */
  clock: {
    w: number
    b: number
    running: Color | ''
    /** ms ที่เหลือก่อนนาฬิกาของฝั่ง running จะเริ่มนับ (มีเฉพาะช่วงโยนเหรียญตอนเริ่มเกม) */
    delay?: number
  }
  result?: string
  reason?: string
  /**
   * มีเฉพาะเกมที่หน้าเว็บไม่ได้คำนวณกติกาเอง (หมากรุกไทย หมากฮอส หมากหนีบ) และเฉพาะระหว่างเล่น
   * legal: ช่องต้นทาง → ช่องปลายทางของฝ่ายที่ถึงตา, check: ช่องของขุนที่ถูกรุก
   */
  legal?: Record<string, string[]>
  check?: string
  /** ช่องที่หมากของฝ่ายที่ยังไม่ถึงตาเดินไปได้ตามวิธีเดินของมัน ใช้แสดงเส้นทางเดินเมื่อชี้ที่หมากเท่านั้น */
  reach?: Record<string, string[]>
  count?: CountInfo
  /** ฝ่ายที่ถึงตาต้องกิน (หมากฮอสบังคับกิน) */
  forced?: boolean
  /** ผู้ชมที่กำลังเปิดห้องอยู่ (เซิร์ฟเวอร์ส่งรายชื่อไม่เกิน 12 คน) และจำนวนผู้ชมทั้งหมด */
  spectators?: SpectatorInfo[]
  watching?: number
  /** สีของผู้เล่นที่กด "เล่นต่อ" แล้วหลังเกมจบ เกมใหม่เริ่มเมื่อกดครบสองคน */
  rematch?: Color[]
  /** ลำดับของเกมในห้องนี้ (0 = เกมแรก) เพิ่มทุกครั้งที่เล่นต่อ */
  round?: number
  /** ms ที่เหลือก่อนห้องปิดเอง ณ ตอนที่เซิร์ฟเวอร์ส่ง (มีเฉพาะหลังเกมจบ) */
  closeIn?: number
  /** ห้องรอก่อนเกม (มีเฉพาะตอน status เป็น waiting) */
  lobby?: LobbyInfo
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

export interface ChatItem {
  id: number
  /** เลขประจำตัวในห้องของผู้ส่ง ข้อความจากคนเดียวกันได้ค่าเดียวกัน (ไม่ใช่ user ID) */
  sender: string
  /** สีของผู้ส่ง หรือ '' ถ้าเป็นผู้ชม */
  from: Color | ''
  text: string
  /** unix ms */
  at: number
  mine: boolean
}

export interface ChatMsg extends ChatItem {
  type: 'chat'
}

export interface ChatHistoryMsg {
  type: 'chat_history'
  messages: ChatItem[]
}

/** เซิร์ฟเวอร์รับการรายงานข้อความแชทแล้ว */
export interface ReportOkMsg {
  type: 'report_ok'
  id: number
}

/** คำตอบของ ping: การเชื่อมต่อยังส่งข้อมูลถึงกันได้ */
export interface PongMsg {
  type: 'pong'
}

export type ServerMsg =
  | PongMsg
  | StateMsg
  | AuthOkMsg
  | GameOverMsg
  | ErrorMsg
  | ChatMsg
  | ChatHistoryMsg
  | ReportOkMsg

export type ClientMsg =
  | { type: 'auth'; token: string }
  | { type: 'join'; room: string }
  | { type: 'move'; ply: number; from: string; to: string; promo: Promo }
  | { type: 'resign' }
  | { type: 'chat'; text: string }
  | { type: 'report'; id: number }
  | { type: 'ready'; ready: boolean }
  | { type: 'kick' }
  | { type: 'set'; set: string }
  | { type: 'rematch' }
  | { type: 'ping' }

const SERVER_TYPES = new Set(['pong', 'state', 'auth_ok', 'game_over', 'error', 'chat', 'chat_history', 'report_ok'])

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

/**
 * รหัสห้อง: ตัวอักษรผสมตัวเลข 6 ตัว เช่น "K7Q2XM" (ต้องตรงกับ roomIDRe ฝั่งเซิร์ฟเวอร์)
 * ไม่มีตัวที่สับสนกันง่าย (0 O 1 I L) ต้องมีทั้งตัวอักษรและตัวเลข และยังรับรหัสตัวเลข 6 หลักแบบเดิม
 * ผู้ใช้พิมพ์ตัวเล็กได้ หน้าเว็บแปลงเป็นตัวใหญ่ก่อนใช้เสมอ
 */
export const ROOM_ID_LENGTH = 6
export const ROOM_ID_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const MIXED = /^[A-HJKMNP-Z2-9]{6}$/
const LEGACY = /^[1-9]\d{5}$/

export function isRoomId(value: string): boolean {
  if (LEGACY.test(value)) return true
  return MIXED.test(value) && /\d/.test(value) && /[A-Z]/.test(value)
}

/** รหัสห้องในรูปที่ใช้จริง (ตัวพิมพ์ใหญ่) หรือ null ถ้าไม่ใช่รหัสห้อง */
export function normalizeRoomId(value: string): string | null {
  const up = value.toUpperCase()
  return isRoomId(up) ? up : null
}

/** ดึงรหัสห้องจากสิ่งที่ผู้ใช้วาง ซึ่งอาจเป็นรหัสล้วน รหัสที่มีช่องว่างคั่น หรือทั้งลิงก์ */
export function extractRoomId(input: string): string | null {
  const text = input.trim()
  // ลิงก์ห้อง: เอารหัสหลัง /room/ (ส่วนอื่นของลิงก์ เช่น เลขพอร์ต ไม่นับ)
  const linked = /\/room\/([A-Za-z0-9]{6})(?:[^A-Za-z0-9]|$)/.exec(text)?.[1]
  if (linked) return normalizeRoomId(linked)
  // รหัสที่พิมพ์หรือคัดลอกมาแบบมีช่องว่างหรือขีดคั่น เช่น "K7Q 2XM"
  const compact = normalizeRoomId(text.replace(/[\s-]/g, ''))
  if (compact) return compact
  // รหัสที่อยู่ในประโยค เช่น "ห้อง K7Q2XM นะ" หรือ "ห้อง K7Q 2XM นะ"
  for (const m of text.matchAll(/(?:^|[^A-Za-z0-9])([A-Za-z0-9]{3}[\s-]?[A-Za-z0-9]{3})(?=$|[^A-Za-z0-9])/g)) {
    const found = normalizeRoomId(m[1].replace(/[\s-]/g, ''))
    if (found) return found
  }
  return null
}

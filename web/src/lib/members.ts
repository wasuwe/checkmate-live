// หน้าดูสมาชิกของผู้ดูแล: ชนิดข้อมูล การเรียก API และตัวช่วยจัดรายการ
// เซิร์ฟเวอร์ตรวจสิทธิ์ admin ทุกคำขอ ข้อมูลในไฟล์นี้มีอีเมลของสมาชิก จึงไม่ถูกเก็บลงเครื่อง

import { authedFetch } from './api'

/** ผลรวมของเกมที่จบแล้ว จากมุมของผู้เล่นคนหนึ่ง */
export interface Stats {
  games: number
  wins: number
  losses: number
  draws: number
  /** เวลาเล่นรวมเป็นวินาที */
  seconds: number
  lastPlayedAt?: string
}

/** สิ่งที่สมาชิกกำลังทำอยู่ตอนนี้ */
export interface Live {
  status: 'playing' | 'waiting'
  game: string
  room: string
  /** false = หลุดหรือปิดหน้าไป แต่ที่นั่งยังอยู่ */
  connected: boolean
  opponent?: string
  opponentGuest?: boolean
}

export interface Member extends Stats {
  id: string
  email: string
  name?: string
  avatar?: string
  joinedAt: string
  lastSignInAt?: string
  live?: Live
}

export interface GameStats extends Stats {
  game: string
}

/** คู่แข่งหนึ่งคน ไม่มี id = ผู้เล่นรับเชิญทั้งหมดรวมกัน */
export interface Opponent extends Stats {
  id?: string
  name?: string
  avatar?: string
  email?: string
}

export type Outcome = 'win' | 'loss' | 'draw'

export interface GameRow {
  game: string
  color: 'w' | 'b'
  outcome: Outcome
  reason: string
  tc: string
  startedAt: string
  seconds: number
  opponentId?: string
  opponentName?: string
  opponentEmail?: string
}

export interface MemberDetail extends Member {
  byGame: GameStats[]
  opponents: Opponent[]
  recent: GameRow[]
}

export const GUEST_NAME = 'ผู้เล่นรับเชิญ'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** ตรวจรูปร่างของสมาชิกหนึ่งคนจากเซิร์ฟเวอร์ (ต้องมี id, อีเมล และตัวเลขสถิติครบ) */
function isMember(value: unknown): value is Member {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    value.id !== '' &&
    typeof value.email === 'string' &&
    typeof value.joinedAt === 'string' &&
    ['games', 'wins', 'losses', 'draws', 'seconds'].every((k) => typeof value[k] === 'number')
  )
}

/** อ่านรายการสมาชิกจากคำตอบของเซิร์ฟเวอร์ คืน null ถ้ารูปร่างไม่ถูก */
export function parseMembers(value: unknown): Member[] | null {
  if (!isRecord(value) || !Array.isArray(value.users)) return null
  return value.users.every(isMember) ? value.users : null
}

/** อ่านรายละเอียดของสมาชิกจากคำตอบของเซิร์ฟเวอร์ คืน null ถ้ารูปร่างไม่ถูก */
export function parseMemberDetail(value: unknown): MemberDetail | null {
  if (!isRecord(value) || !isMember(value.user)) return null
  const user = value.user as Member & Record<string, unknown>
  if (![user.byGame, user.opponents, user.recent].every(Array.isArray)) return null
  return user as unknown as MemberDetail
}

export async function fetchMembers(): Promise<Member[]> {
  const res = await authedFetch('/api/admin/users')
  if (!res.ok) throw new Error(`members: ${res.status}`)
  const list = parseMembers(await res.json())
  if (!list) throw new Error('members: bad response')
  return list
}

export async function fetchMember(id: string): Promise<MemberDetail> {
  const res = await authedFetch(`/api/admin/users/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`member: ${res.status}`)
  const detail = parseMemberDetail(await res.json())
  if (!detail) throw new Error('member: bad response')
  return detail
}

/** ชื่อที่ใช้เรียกคนคนหนึ่ง: ชื่อที่ตั้งไว้ ถ้าไม่มีใช้อีเมล ถ้าไม่มีบัญชีคือผู้เล่นรับเชิญ */
export function personLabel(p: { name?: string; email?: string }): string {
  return p.name || p.email || GUEST_NAME
}

/** เวลาเล่นแบบอ่านง่าย เช่น "45 วินาที", "12 นาที", "2 ชม. 5 นาที" (0 = ขีด) */
export function formatDuration(seconds: number): string {
  if (!(seconds > 0)) return '–'
  if (seconds < 60) return `${Math.round(seconds)} วินาที`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} นาที`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} ชม.` : `${hours} ชม. ${rest} นาที`
}

/** อัตราชนะเป็นเปอร์เซ็นต์ (ปัดเป็นจำนวนเต็ม) หรือ null ถ้ายังไม่เคยเล่น */
export function winRate(s: Pick<Stats, 'games' | 'wins'>): number | null {
  return s.games > 0 ? Math.round((s.wins / s.games) * 100) : null
}

const dateFormat = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFormat = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** วันที่แบบไทย หรือขีดถ้าไม่มีค่าหรืออ่านไม่ได้ */
export function formatDate(iso: string | undefined, withTime = false): string {
  if (!iso) return '–'
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return '–'
  return (withTime ? dateTimeFormat : dateFormat).format(t)
}

/** เวลาที่ผ่านมาแบบสั้น เช่น "5 นาทีก่อน" ถ้านานเกิน 30 วันแสดงเป็นวันที่ */
export function timeAgo(iso: string | undefined, now: number): string {
  if (!iso) return '–'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '–'
  const minutes = Math.floor((now - t) / 60_000)
  if (minutes < 1) return 'เมื่อสักครู่'
  if (minutes < 60) return `${minutes} นาทีก่อน`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ชั่วโมงก่อน`
  const days = Math.floor(hours / 24)
  if (days <= 30) return `${days} วันก่อน`
  return formatDate(iso)
}

export type MemberFilter = 'all' | 'live' | 'played' | 'never'

export const FILTERS: { id: MemberFilter; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'live', label: 'อยู่ในห้องตอนนี้' },
  { id: 'played', label: 'เคยเล่นแล้ว' },
  { id: 'never', label: 'ยังไม่เคยเล่น' },
]

/** กรองตามคำค้น (ชื่อหรืออีเมล ไม่สนตัวพิมพ์) และตามกลุ่ม */
export function filterMembers(list: Member[], query: string, filter: MemberFilter): Member[] {
  const q = query.trim().toLowerCase()
  return list.filter((m) => {
    if (filter === 'live' && !m.live) return false
    if (filter === 'played' && m.games === 0) return false
    if (filter === 'never' && m.games > 0) return false
    return q === '' || m.email.toLowerCase().includes(q) || (m.name ?? '').toLowerCase().includes(q)
  })
}

export type MemberSort = 'joined' | 'recent' | 'games' | 'time' | 'name'

export const SORTS: { id: MemberSort; label: string }[] = [
  { id: 'joined', label: 'สมัครล่าสุด' },
  { id: 'recent', label: 'เล่นล่าสุด' },
  { id: 'games', label: 'เล่นมากที่สุด' },
  { id: 'time', label: 'ใช้เวลามากที่สุด' },
  { id: 'name', label: 'ชื่อ ก–ฮ' },
]

const time = (iso: string | undefined) => (iso ? new Date(iso).getTime() || 0 : 0)

/**
 * เรียงรายการ (คืนรายการใหม่) คนที่อยู่ในห้องตอนนี้ไม่ถูกดันขึ้นบนเอง ใช้ตัวกรองแทน
 * ค่าที่เท่ากันเรียงตามวันที่สมัคร เพื่อให้ลำดับไม่สลับไปมาระหว่างการโหลดใหม่
 */
export function sortMembers(list: Member[], sort: MemberSort): Member[] {
  const joined = (a: Member, b: Member) => time(b.joinedAt) - time(a.joinedAt) || a.id.localeCompare(b.id)
  const by: Record<MemberSort, (a: Member, b: Member) => number> = {
    joined,
    recent: (a, b) => time(b.lastPlayedAt) - time(a.lastPlayedAt),
    games: (a, b) => b.games - a.games,
    time: (a, b) => b.seconds - a.seconds,
    name: (a, b) => personLabel(a).localeCompare(personLabel(b), 'th'),
  }
  return [...list].sort((a, b) => by[sort](a, b) || joined(a, b))
}

export interface MemberSummary {
  total: number
  playing: number
  waiting: number
  played: number
}

/** ตัวเลขสรุปด้านบนของหน้า */
export function summarize(list: Member[]): MemberSummary {
  return {
    total: list.length,
    playing: list.filter((m) => m.live?.status === 'playing').length,
    waiting: list.filter((m) => m.live?.status === 'waiting').length,
    played: list.filter((m) => m.games > 0).length,
  }
}

export const OUTCOME_TEXT: Record<Outcome, string> = { win: 'ชนะ', loss: 'แพ้', draw: 'เสมอ' }

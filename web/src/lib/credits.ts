// ข้อมูลหน้าเครดิต: ทีมงาน และตัวละคร OC
//
// ข้อมูลจริงเก็บที่เซิร์ฟเวอร์ และแก้ได้จากหน้าจัดการข้อมูลของ admin (/backstage)
// ถ้ายังไม่เคยมีใครบันทึก หน้าเครดิตจะแสดงข้อมูลตัวอย่างด้านล่าง (SAMPLE_CREDITS) ซึ่งมาจากไฟล์ต้นแบบ
// รูปแบบต้องตรงกับ server/internal/content/content.go

import { useEffect, useState } from 'react'

export interface Person {
  id: string
  /** เลขรุ่นของรายการ เพิ่มทุกครั้งที่ถูกแก้ หน้าจัดการส่งกลับไปตอนบันทึกเพื่อกันการแก้ทับกัน */
  rev: number
  name: string
  /** ชื่อบัญชีที่แสดงใต้ชื่อ เช่น '@nok.dev' */
  handle: string
  /** ลิงก์ที่เปิดเมื่อกด ว่าง = ไม่เป็นลิงก์ */
  link: string
  bg: string
  /** ที่อยู่รูปของคนนี้ที่อัปโหลดผ่านหน้าจัดการ หรือ '' ถ้าไม่มี (ใช้ตัวอักษรย่อแทน) */
  image: string
}

export interface TeamGroup {
  id: string
  rev: number
  role: string
  bg: string
  ids: string[]
}

export interface Oc {
  id: string
  rev: number
  name: string
  title: string
  /** id ของเจ้าของและผู้วาดใน people */
  owner: string
  artist: string
  /** สีประจำตัวละคร และสีอ่อนของพื้นหลัง */
  color: string
  pale: string
  bio: string
  /** ที่อยู่รูปตัวละครที่อัปโหลดผ่านหน้าจัดการ หรือ '' ถ้าไม่มี */
  image: string
}

export interface CreditsData {
  people: Person[]
  team: TeamGroup[]
  ocs: Oc[]
}

export const SAMPLE_CREDITS: CreditsData = {
  people: [
    { id: 'nok', rev: 1, name: 'Nok', handle: '@nok.dev', link: '', bg: '#FFB8CC', image: '' },
    { id: 'mew', rev: 1, name: 'Mew', handle: '@mewdraws', link: '', bg: '#9FE3C9', image: '' },
    { id: 'pim', rev: 1, name: 'Pim', handle: '@pim.art', link: '', bg: '#C9BDFF', image: '' },
    { id: 'tae', rev: 1, name: 'Tae', handle: '@taecodes', link: '', bg: '#FFDC85', image: '' },
  ],
  team: [
    { id: 'dev', rev: 1, role: 'Developer', bg: '#A9D6F7', ids: ['nok', 'tae'] },
    { id: 'art', rev: 1, role: 'Artist', bg: '#FFB8CC', ids: ['mew', 'pim'] },
  ],
  ocs: [
    { id: 'kaimuk', rev: 1, name: 'ไข่มุก', title: 'ราชินีขนมหวาน', owner: 'mew', artist: 'mew', color: '#FF8FB1', pale: '#FFE8EF', bio: 'ราชินีผู้ชอบกินขนมระหว่างเดินหมาก ถ้าแพ้จะงอนไปสามวัน', image: '' },
    { id: 'phueng', rev: 1, name: 'ผึ้ง', title: 'อัศวินน้ำผึ้ง', owner: 'mew', artist: 'pim', color: '#FFD36E', pale: '#FFF7DA', bio: 'อัศวินขี่ม้าตัวจิ๋ว เดินเป็นรูปตัว L ไปทุกที่ แม้แต่ในชีวิตจริง', image: '' },
    { id: 'mintra', rev: 1, name: 'มินตรา', title: 'บิชอปมิ้นต์', owner: 'nok', artist: 'pim', color: '#86D9B9', pale: '#E8FAF2', bio: 'เดินทแยงอย่างเดียวและภูมิใจกับมันมาก ชอบดื่มชามิ้นต์', image: '' },
    { id: 'kong', rev: 1, name: 'ก้อง', title: 'ป้อมปราการ', owner: 'nok', artist: 'mew', color: '#B9AAF5', pale: '#F1EDFF', bio: 'ตัวใหญ่ใจดี ยืนเฝ้ามุมกระดานจนกว่าจะถึงตาเข้าป้อม', image: '' },
    { id: 'fah', rev: 1, name: 'ฟ้า', title: 'เบี้ยผู้ฝันไกล', owner: 'tae', artist: 'pim', color: '#8CC7F2', pale: '#E6F4FF', bio: 'เบี้ยธรรมดาที่ฝันจะเดินถึงแถวสุดท้ายแล้วกลายเป็นควีน', image: '' },
    { id: 'koko', rev: 1, name: 'โกโก้', title: 'ขุนผู้ง่วงนอน', owner: 'pim', artist: 'pim', color: '#C69B72', pale: '#F7E9D7', bio: 'ขุนที่ขยับทีละช่องเพราะยังไม่ตื่นดี แต่ไม่เคยโดนรุกจนสักครั้ง', image: '' },
  ],
}

/** คนที่ไม่พบ (ข้อมูลอ้างถึง id ที่ไม่มี) แสดงเป็นชื่อว่างแทนการทำให้หน้าพัง */
const NOBODY: Person = { id: '', rev: 0, name: '—', handle: '', link: '', bg: '#FFFFFF', image: '' }

export function personOf(data: CreditsData, id: string): Person {
  return data.people.find((p) => p.id === id) ?? NOBODY
}

/** เลขลำดับของตัวละครตามลำดับในรายการทั้งหมด เช่น "01" (ไม่เปลี่ยนตามตัวกรอง) */
export function ocNumber(data: CreditsData, oc: Oc): string {
  return String(data.ocs.indexOf(oc) + 1).padStart(2, '0')
}

/** ตัวกรองเจ้าของ: "ทั้งหมด" ตามด้วยคนที่มี OC อย่างน้อยหนึ่งตัว */
export function ownerFilters(data: CreditsData): { id: string; label: string }[] {
  const owners = data.people.filter((p) => data.ocs.some((o) => o.owner === p.id))
  return [{ id: 'all', label: 'ทั้งหมด' }, ...owners.map((p) => ({ id: p.id, label: p.name }))]
}

export function ocsOf(data: CreditsData, filter: string): Oc[] {
  return filter === 'all' ? data.ocs : data.ocs.filter((o) => o.owner === filter)
}

/**
 * ตัวละครที่ควรถูกเลือกหลังเปลี่ยนตัวกรอง: ตัวเดิมถ้ายังอยู่ในรายการ ไม่งั้นตัวแรกของรายการใหม่
 */
export function selectionFor(data: CreditsData, filter: string, currentId: string): string {
  const list = ocsOf(data, filter)
  return list.some((o) => o.id === currentId) ? currentId : (list[0]?.id ?? data.ocs[0]?.id ?? '')
}

/**
 * ตำแหน่งถัดไปเมื่อกดปุ่มลูกศรในตารางเลือกตัว (`columns` คือจำนวนคอลัมน์ที่แสดงอยู่)
 * คืนตำแหน่งเดิมถ้าไปต่อไม่ได้ หรือไม่ใช่ปุ่มลูกศร
 */
export function moveIndex(key: string, index: number, count: number, columns: number): number {
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[key]
  if (step === undefined) return index
  const next = index + step
  return next >= 0 && next < count ? next : index
}

/** ลิงก์ที่เปิดได้อย่างปลอดภัย: เฉพาะ http(s) ไม่งั้นถือว่าไม่มีลิงก์ */
export function safeLink(link: string): string | null {
  return /^https?:\/\//i.test(link) ? link : null
}

/** สีที่ใส่ใน style ได้อย่างปลอดภัย: เฉพาะ #rrggbb ไม่งั้นใช้สีสำรอง */
export function safeColor(color: string, fallback = '#FFFFFF'): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback
}

/** ที่อยู่รูปที่แสดงได้: เฉพาะรูปที่เสิร์ฟจากเซิร์ฟเวอร์ของเราเอง */
export function safeImage(image: string): string | null {
  return /^\/api\/content-images\/[0-9a-f]{32}$/.test(image) ? image : null
}

/**
 * อักษรที่ใช้แทนรูปเมื่อยังไม่มีรูป: ตัวแรกของชื่อ แต่ข้ามสระนำหน้าของภาษาไทย (เ แ โ ใ ไ)
 * เพื่อให้ "ไข่มุก" ได้ "ข" ไม่ใช่ "ไ"
 */
export function initialOf(name: string): string {
  const chars = [...name.trim()]
  return (chars.length > 1 && 'เแโใไ'.includes(chars[0]) ? chars[1] : chars[0]) ?? ''
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) ? v : 0)

/**
 * แปลงข้อมูลจากเซิร์ฟเวอร์ให้อยู่ในรูปที่หน้าเว็บใช้ได้เสมอ คืน null ถ้าไม่ใช่ข้อมูลเครดิต
 * เซิร์ฟเวอร์ตรวจข้อมูลอย่างเข้มแล้ว ตรงนี้กันแค่ไม่ให้หน้าพังถ้ารูปแบบไม่ตรง
 */
export function parseCredits(value: unknown): CreditsData | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (!Array.isArray(raw.people) || !Array.isArray(raw.team) || !Array.isArray(raw.ocs)) return null
  const obj = (v: unknown) => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {})
  return {
    people: raw.people.map(obj).map((p) => ({ id: str(p.id), rev: num(p.rev), name: str(p.name), handle: str(p.handle), link: str(p.link), bg: str(p.bg), image: str(p.image) })),
    team: raw.team.map(obj).map((g) => ({
      id: str(g.id),
      rev: num(g.rev),
      role: str(g.role),
      bg: str(g.bg),
      ids: Array.isArray(g.ids) ? g.ids.filter((id): id is string => typeof id === 'string') : [],
    })),
    ocs: raw.ocs.map(obj).map((o) => ({
      id: str(o.id),
      rev: num(o.rev),
      name: str(o.name),
      title: str(o.title),
      owner: str(o.owner),
      artist: str(o.artist),
      color: str(o.color),
      pale: str(o.pale),
      bio: str(o.bio),
      image: str(o.image),
    })),
  }
}

/** ข้อมูลเครดิตที่บันทึกไว้ที่เซิร์ฟเวอร์ หรือ null ถ้ายังไม่เคยบันทึก โยน error ถ้าเรียกไม่สำเร็จ */
export async function fetchCredits(): Promise<CreditsData | null> {
  const res = await fetch('/api/credits')
  if (!res.ok) throw new Error(`credits: ${res.status}`)
  const body = (await res.json()) as { credits?: unknown }
  return parseCredits(body.credits)
}

export interface CreditsState {
  data: CreditsData
  /** กำลังแสดงข้อมูลตัวอย่าง เพราะยังไม่มีข้อมูลจริงหรือโหลดไม่สำเร็จ */
  sample: boolean
  loading: boolean
}

/** ข้อมูลหน้าเครดิต: ของจริงจากเซิร์ฟเวอร์ถ้ามี ไม่งั้นข้อมูลตัวอย่าง */
export function useCredits(): CreditsState {
  const [state, setState] = useState<CreditsState>({ data: SAMPLE_CREDITS, sample: true, loading: true })
  useEffect(() => {
    let alive = true
    fetchCredits()
      .then((data) => alive && setState(data ? { data, sample: false, loading: false } : { data: SAMPLE_CREDITS, sample: true, loading: false }))
      .catch(() => alive && setState({ data: SAMPLE_CREDITS, sample: true, loading: false }))
    return () => {
      alive = false
    }
  }, [])
  return state
}

// ---------- กระดานเครดิต ----------

/** คนหนึ่งคนบนกระดานเครดิต */
export interface BoardSeat {
  person: Person
  /** บทบาททั้งหมดของคนนี้ (ชื่อกลุ่มและสีของกลุ่ม) */
  roles: { role: string; bg: string }[]
  /** ฝั่งของกระดาน: 0 กับ 1 ยืนประจันหน้ากัน */
  side: 0 | 1
  /** ระยะจากแถวหลังของฝั่งตัวเอง (0 = หลังสุด) */
  rank: number
  /** ตำแหน่งตามแนวขวางของกระดาน (0-3) */
  file: number
}

export interface BoardLayout {
  seats: BoardSeat[]
  /** ชื่อบทบาทของแต่ละฝั่ง */
  sides: [string[], string[]]
  /** คนที่ไม่มีช่องเหลือให้ยืน (ฝั่งหนึ่งยืนได้ 16 คน) แสดงเป็นรายการใต้กระดาน */
  overflow: BoardSeat[]
}

/**
 * ลำดับช่องที่ใช้ยืน: กระจายแบบตาหมากรุกก่อน (คนที่ยืนหน้ากับหลังจะไม่อยู่แนวเดียวกัน ป้ายชื่อจึงไม่บังกัน)
 * แล้วค่อยเติมช่องที่เหลือ
 */
const BOARD_SLOTS: [rank: number, file: number][] = [
  [1, 1], [0, 2], [2, 2], [1, 3], [0, 0], [2, 0], [3, 1], [3, 3],
  [1, 0], [0, 1], [2, 1], [1, 2], [0, 3], [2, 3], [3, 0], [3, 2],
]

/**
 * จัดทีมงานลงกระดาน: กลุ่มลำดับคู่ (กลุ่มที่ 1, 3, ...) อยู่ฝั่งหนึ่ง กลุ่มลำดับคี่อยู่อีกฝั่ง
 * คนที่อยู่หลายกลุ่มยืนช่องเดียว ตามกลุ่มแรกที่พบ และแสดงทุกบทบาท
 * ถ้ามีคนอยู่ฝั่งเดียว (เช่น มีกลุ่มเดียว) จะสลับฝั่งทีละคนเพื่อให้มีสองฝั่งประจันหน้ากัน
 */
export function boardLayout(data: CreditsData): BoardLayout {
  const found = new Map<string, { person: Person; roles: { role: string; bg: string }[]; side: 0 | 1 }>()
  data.team.forEach((group, g) => {
    for (const id of group.ids) {
      const person = data.people.find((p) => p.id === id)
      if (!person) continue
      const entry = found.get(id)
      if (entry) entry.roles.push({ role: group.role, bg: group.bg })
      else found.set(id, { person, roles: [{ role: group.role, bg: group.bg }], side: g % 2 === 0 ? 0 : 1 })
    }
  })
  const list = [...found.values()]
  if (list.length > 1 && (list.every((e) => e.side === 0) || list.every((e) => e.side === 1))) {
    list.forEach((e, i) => (e.side = i % 2 === 0 ? 0 : 1))
  }

  const seats: BoardSeat[] = []
  const overflow: BoardSeat[] = []
  const used = [0, 0]
  for (const e of list) {
    const slot = BOARD_SLOTS[used[e.side]++]
    // ฝั่งที่สองกลับด้านแนวขวาง ให้สองฝั่งไม่เป็นเงาสะท้อนกันพอดี
    if (slot) seats.push({ ...e, rank: slot[0], file: e.side === 0 ? slot[1] : 3 - slot[1] })
    else overflow.push({ ...e, rank: 0, file: 0 })
  }
  const rolesOf = (side: 0 | 1) => [...new Set(list.filter((e) => e.side === side).map((e) => e.roles[0].role))]
  return { seats, sides: [rolesOf(0), rolesOf(1)], overflow }
}

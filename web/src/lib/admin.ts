// หน้าจัดการข้อมูลของผู้ดูแล (admin): เรียก API และตัวช่วยแก้ไขข้อมูลเครดิต
//
// ใครเป็น admin กำหนดที่เซิร์ฟเวอร์ด้วย ADMIN_EMAILS และเซิร์ฟเวอร์ตรวจสิทธิ์ทุกคำขอ
// การซ่อนเมนูในหน้าเว็บเป็นแค่ความสะดวก ไม่ใช่การป้องกัน

import { useEffect, useState } from 'react'
import { authedFetch } from './api'
import { parseCredits, type CreditsData, type Oc, type Person } from './credits'
import { useSession } from './session'

/** ด้านยาวสุดของรูปตัวละครที่ส่งขึ้นเซิร์ฟเวอร์ (พิกเซล) */
export const OC_IMAGE_SIDE = 1000

export class AdminError extends Error {
  /** ช่องที่เซิร์ฟเวอร์บอกว่าผิด เช่น "ocs[2].owner" */
  field?: string
}

const ERRORS: Record<string, string> = {
  unauthorized: 'ต้องเข้าสู่ระบบก่อน',
  forbidden: 'บัญชีนี้ไม่มีสิทธิ์จัดการข้อมูล',
  rate_limited: 'ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่',
  bad_image: 'ไฟล์นี้ใช้ไม่ได้ ใช้ได้เฉพาะรูป PNG หรือ JPEG',
  image_too_large: 'รูปใหญ่เกินไป',
  unavailable: 'เซิร์ฟเวอร์บันทึกไม่ได้ในตอนนี้ ลองใหม่อีกครั้ง',
}

const FIELD_NAMES: Record<string, string> = {
  id: 'รหัส',
  name: 'ชื่อ',
  handle: 'ชื่อบัญชี',
  link: 'ลิงก์ (ต้องขึ้นต้นด้วย http:// หรือ https://)',
  bg: 'สี',
  role: 'ชื่อบทบาท',
  ids: 'สมาชิก',
  title: 'ฉายา',
  owner: 'เจ้าของ',
  artist: 'ผู้วาด',
  color: 'สีประจำตัว',
  pale: 'สีพื้นหลัง',
  bio: 'คำอธิบาย',
  image: 'รูป',
}
const LIST_NAMES: Record<string, string> = { people: 'คน', team: 'กลุ่มทีม', ocs: 'ตัวละคร' }

/** แปลงชื่อช่องจากเซิร์ฟเวอร์เป็นข้อความ เช่น "ocs[2].owner" → "ตัวละครลำดับที่ 3: เจ้าของ" */
export function fieldLabel(field: string): string {
  const match = /^(people|team|ocs)(?:\[(\d+)\])?(?:\.(\w+))?/.exec(field)
  if (!match) return 'ข้อมูลบางช่อง'
  const [, list, index, name] = match
  if (index === undefined) return `จำนวน${LIST_NAMES[list]}มากเกินไป`
  return `${LIST_NAMES[list]}ลำดับที่ ${Number(index) + 1}: ${FIELD_NAMES[name ?? ''] ?? 'ข้อมูล'}`
}

async function adminError(res: Response): Promise<AdminError> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; field?: string }
  const err = new AdminError(
    body.error === 'bad_credits' && body.field
      ? `ข้อมูลไม่ถูกต้องที่ ${fieldLabel(body.field)}`
      : (ERRORS[body.error ?? ''] ?? 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง'),
  )
  err.field = body.field
  return err
}

/** ถามเซิร์ฟเวอร์ว่าบัญชีที่ login อยู่เป็น admin หรือไม่ (เรียกไม่สำเร็จ = ไม่ใช่) */
export async function fetchIsAdmin(): Promise<boolean> {
  try {
    const res = await authedFetch('/api/admin/me')
    if (!res.ok) return false
    return ((await res.json()) as { admin?: unknown }).admin === true
  } catch {
    return false
  }
}

/**
 * สถานะ admin ของผู้ใช้ปัจจุบัน: null = กำลังตรวจ
 * ผู้เล่นรับเชิญไม่มีทางเป็น admin จึงไม่ต้องถามเซิร์ฟเวอร์
 */
export function useIsAdmin(): boolean | null {
  const session = useSession()
  const [result, setResult] = useState<{ email: string; admin: boolean } | null>(null)
  const email = session.email
  useEffect(() => {
    if (!email) return
    let alive = true
    fetchIsAdmin().then((admin) => alive && setResult({ email, admin }))
    return () => {
      alive = false
    }
  }, [email])
  if (session.loading) return null
  if (!email) return false
  return result && result.email === email ? result.admin : null
}

/** บันทึกข้อมูลเครดิตทั้งชุด คืนข้อมูลที่เซิร์ฟเวอร์จัดรูปแล้ว */
export async function saveCredits(data: CreditsData): Promise<CreditsData> {
  let res: Response
  try {
    res = await authedFetch('/api/admin/credits', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch {
    throw new AdminError('เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่')
  }
  if (!res.ok) throw await adminError(res)
  const saved = parseCredits(((await res.json()) as { credits?: unknown }).credits)
  if (!saved) throw new AdminError('เซิร์ฟเวอร์ตอบกลับในรูปแบบที่ไม่รู้จัก')
  return saved
}

/** ขนาดหลังย่อให้ด้านยาวสุดไม่เกิน `max` โดยคงสัดส่วน (ไม่ขยายรูปเล็ก) */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** ย่อรูปในเบราว์เซอร์เป็น PNG (คงพื้นหลังโปร่ง) ก่อนส่ง */
export async function resizeOcImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file) // โยน error ถ้าไม่ใช่รูป
  try {
    const size = fitWithin(bitmap.width, bitmap.height, OC_IMAGE_SIDE)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/png'),
    )
  } finally {
    bitmap.close()
  }
}

/** อัปโหลดรูปตัวละคร คืนที่อยู่ของรูปสำหรับใส่ในข้อมูลเครดิต */
export async function uploadOcImage(file: Blob): Promise<string> {
  let image: Blob
  try {
    image = await resizeOcImage(file)
  } catch {
    throw new AdminError(ERRORS.bad_image)
  }
  let res: Response
  try {
    res = await authedFetch('/api/admin/images', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: image })
  } catch {
    throw new AdminError('เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่')
  }
  if (!res.ok) throw await adminError(res)
  const url = ((await res.json()) as { url?: unknown }).url
  if (typeof url !== 'string') throw new AdminError('เซิร์ฟเวอร์ตอบกลับในรูปแบบที่ไม่รู้จัก')
  return url
}

// ---------- ตัวช่วยแก้ไขข้อมูล (ไม่แก้ของเดิม คืนชุดใหม่เสมอ) ----------

const PASTELS = ['#FFB8CC', '#9FE3C9', '#C9BDFF', '#FFDC85', '#A9D6F7', '#F7C59F']
const OC_COLORS: [string, string][] = [
  ['#FF8FB1', '#FFE8EF'],
  ['#FFD36E', '#FFF7DA'],
  ['#86D9B9', '#E8FAF2'],
  ['#B9AAF5', '#F1EDFF'],
  ['#8CC7F2', '#E6F4FF'],
  ['#C69B72', '#F7E9D7'],
]

/** รหัสใหม่ที่ไม่ซ้ำกับที่มีอยู่ เช่น "p3" (รหัสใช้ภายในเท่านั้น ผู้ชมไม่เห็น) */
export function newId(prefix: string, taken: string[]): string {
  for (let n = taken.length + 1; ; n++) {
    const id = `${prefix}${n}`
    if (!taken.includes(id)) return id
  }
}

export function addPerson(data: CreditsData): CreditsData {
  const person: Person = {
    id: newId('p', data.people.map((p) => p.id)),
    name: '',
    handle: '',
    link: '',
    bg: PASTELS[data.people.length % PASTELS.length],
  }
  return { ...data, people: [...data.people, person] }
}

/** ตัวละครที่ยังอ้างถึงคนนี้อยู่ (เป็นเจ้าของหรือผู้วาด) ต้องเปลี่ยนก่อนจึงจะลบคนได้ */
export function ocsUsing(data: CreditsData, personId: string): Oc[] {
  return data.ocs.filter((o) => o.owner === personId || o.artist === personId)
}

/** ลบคน และเอาออกจากทุกกลุ่มทีม ไม่ทำอะไรถ้ายังมีตัวละครอ้างถึงอยู่ */
export function removePerson(data: CreditsData, personId: string): CreditsData {
  if (ocsUsing(data, personId).length > 0) return data
  return {
    ...data,
    people: data.people.filter((p) => p.id !== personId),
    team: data.team.map((g) => ({ ...g, ids: g.ids.filter((id) => id !== personId) })),
  }
}

export function addGroup(data: CreditsData): CreditsData {
  return { ...data, team: [...data.team, { role: '', bg: PASTELS[(data.team.length + 4) % PASTELS.length], ids: [] }] }
}

/** ใส่หรือเอาคนออกจากกลุ่มทีม */
export function toggleMember(data: CreditsData, groupIndex: number, personId: string): CreditsData {
  return {
    ...data,
    team: data.team.map((g, i) =>
      i !== groupIndex ? g : { ...g, ids: g.ids.includes(personId) ? g.ids.filter((id) => id !== personId) : [...g.ids, personId] },
    ),
  }
}

/** เพิ่มตัวละครใหม่ คืนชุดเดิมถ้ายังไม่มีคนให้เป็นเจ้าของ */
export function addOc(data: CreditsData): CreditsData {
  const first = data.people[0]
  if (!first) return data
  const [color, pale] = OC_COLORS[data.ocs.length % OC_COLORS.length]
  const oc: Oc = {
    id: newId('oc', data.ocs.map((o) => o.id)),
    name: '',
    title: '',
    owner: first.id,
    artist: first.id,
    color,
    pale,
    bio: '',
    image: '',
  }
  return { ...data, ocs: [...data.ocs, oc] }
}

/** ย้ายรายการที่ตำแหน่ง index ไปทาง delta (-1 ขึ้น, 1 ลง) คืนชุดเดิมถ้าย้ายไม่ได้ */
export function moved<T>(list: T[], index: number, delta: number): T[] {
  const to = index + delta
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list
  const out = list.slice()
  ;[out[index], out[to]] = [out[to], out[index]]
  return out
}

/** แทนรายการที่ตำแหน่ง index ด้วยค่าที่แก้แล้ว */
export function replaced<T>(list: T[], index: number, patch: Partial<T>): T[] {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item))
}

/**
 * ปัญหาที่เห็นได้ก่อนส่ง (เซิร์ฟเวอร์ตรวจซ้ำอย่างเข้มกว่า) คืนข้อความแรกที่เจอ หรือ ''
 */
export function firstProblem(data: CreditsData): string {
  for (const [i, p] of data.people.entries()) {
    if (!p.name.trim()) return `คนลำดับที่ ${i + 1} ยังไม่มีชื่อ`
    if (p.link.trim() && !/^https?:\/\//i.test(p.link.trim())) return `ลิงก์ของ ${p.name} ต้องขึ้นต้นด้วย http:// หรือ https://`
  }
  for (const [i, g] of data.team.entries()) {
    if (!g.role.trim()) return `กลุ่มทีมลำดับที่ ${i + 1} ยังไม่มีชื่อบทบาท`
  }
  for (const [i, o] of data.ocs.entries()) {
    if (!o.name.trim()) return `ตัวละครลำดับที่ ${i + 1} ยังไม่มีชื่อ`
  }
  return ''
}

// หน้าจัดการข้อมูลของผู้ดูแล (admin): เรียก API และตัวช่วยของหน้าแก้ไขข้อมูลเครดิต
//
// ใครเป็น admin กำหนดที่เซิร์ฟเวอร์ด้วย ADMIN_EMAILS และเซิร์ฟเวอร์ตรวจสิทธิ์ทุกคำขอ
// การซ่อนเมนูในหน้าเว็บเป็นแค่ความสะดวก ไม่ใช่การป้องกัน
//
// การแก้ทำทีละรายการ (คนหนึ่งคน กลุ่มหนึ่งกลุ่ม ตัวละครหนึ่งตัว) ทุกรายการมีเลขรุ่น (rev)
// ที่ต้องส่งกลับไปตอนบันทึก ถ้ามีคนอื่นแก้รายการนั้นไปก่อน เซิร์ฟเวอร์ปฏิเสธ (conflict) ไม่มีการทับกัน

import { useEffect, useState } from 'react'
import { authedFetch } from './api'
import { parseCredits, type CreditsData, type Oc, type Person, type TeamGroup } from './credits'
import { useSession } from './session'

/** ด้านยาวสุดของรูปตัวละครที่ส่งขึ้นเซิร์ฟเวอร์ (พิกเซล) */
export const OC_IMAGE_SIDE = 1000

export type Kind = 'people' | 'team' | 'ocs'

/** คำสั่งแก้ไขหนึ่งรายการ ต้องตรงกับ content.Op ฝั่งเซิร์ฟเวอร์ */
export type Op =
  | { op: 'create'; kind: Kind }
  | { op: 'delete'; kind: Kind; id: string; rev: number }
  | { op: 'order'; kind: Kind; ids: string[] }
  | { op: 'save'; kind: 'people'; id: string; rev: number; person: Person }
  | { op: 'save'; kind: 'team'; id: string; rev: number; group: TeamGroup }
  | { op: 'save'; kind: 'ocs'; id: string; rev: number; oc: Oc }

/**
 * ผลของการแก้ไข
 * - ok: สำเร็จ data คือข้อมูลทั้งชุดหลังแก้
 * - conflict: มีคนอื่นแก้หรือลบรายการนี้ไปก่อน ไม่มีอะไรถูกบันทึก data คือข้อมูลล่าสุด
 * - error: ไม่สำเร็จด้วยเหตุอื่น
 */
export type Result =
  | { status: 'ok'; data: CreditsData }
  | { status: 'conflict'; message: string; data: CreditsData | null }
  | { status: 'error'; message: string }

const ERRORS: Record<string, string> = {
  unauthorized: 'ต้องเข้าสู่ระบบก่อน',
  forbidden: 'บัญชีนี้ไม่มีสิทธิ์จัดการข้อมูล',
  rate_limited: 'ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่',
  bad_image: 'ไฟล์นี้ใช้ไม่ได้ ใช้ได้เฉพาะรูป PNG หรือ JPEG',
  image_too_large: 'รูปใหญ่เกินไป',
  unavailable: 'เซิร์ฟเวอร์บันทึกไม่ได้ในตอนนี้ ลองใหม่อีกครั้ง',
}

const CONFLICTS: Record<string, string> = {
  conflict: 'มีคนอื่นแก้หรือลบรายการนี้ไปก่อนแล้ว สิ่งที่คุณทำยังไม่ถูกบันทึก',
  in_use: 'ลบไม่ได้ เพราะคนนี้ยังเป็นเจ้าของหรือผู้วาดของตัวละครอยู่',
  exists: 'มีคนตั้งต้นข้อมูลไปแล้ว',
  not_created: 'ยังไม่ได้ตั้งต้นข้อมูล',
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
const LIST_NAMES: Record<Kind, string> = { people: 'คน', team: 'กลุ่มทีม', ocs: 'ตัวละคร' }

/** แปลงชื่อช่องจากเซิร์ฟเวอร์เป็นข้อความ เช่น "ocs[2].owner" → "ตัวละครลำดับที่ 3: เจ้าของ" */
export function fieldLabel(field: string): string {
  const match = /^(people|team|ocs)(?:\[(\d+)\])?(?:\.(\w+))?/.exec(field)
  if (!match) return 'ข้อมูลบางช่อง'
  const list = match[1] as Kind
  if (match[2] === undefined && match[3] === undefined) return `จำนวน${LIST_NAMES[list]}มากเกินไป`
  const where = match[2] === undefined ? LIST_NAMES[list] : `${LIST_NAMES[list]}ลำดับที่ ${Number(match[2]) + 1}`
  return `${where}: ${FIELD_NAMES[match[3] ?? ''] ?? 'ข้อมูล'}`
}

/** แปลง response ของ API แก้ไขเป็น Result (แยกออกมาให้ทดสอบได้โดยไม่ต้องมีเซิร์ฟเวอร์) */
export function readResult(status: number, body: unknown): Result {
  const raw = (typeof body === 'object' && body !== null ? body : {}) as { error?: unknown; field?: unknown; credits?: unknown }
  const code = typeof raw.error === 'string' ? raw.error : ''
  if (status >= 200 && status < 300) {
    const data = parseCredits(raw.credits)
    return data ? { status: 'ok', data } : { status: 'error', message: 'เซิร์ฟเวอร์ตอบกลับในรูปแบบที่ไม่รู้จัก' }
  }
  if (status === 409) {
    return { status: 'conflict', message: CONFLICTS[code] ?? CONFLICTS.conflict, data: parseCredits(raw.credits) }
  }
  if (code === 'bad_credits' && typeof raw.field === 'string') {
    return { status: 'error', message: `ข้อมูลไม่ถูกต้องที่ ${fieldLabel(raw.field)}` }
  }
  return { status: 'error', message: ERRORS[code] ?? 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง' }
}

async function send(path: string, init: RequestInit): Promise<Result> {
  let res: Response
  try {
    res = await authedFetch(path, init)
  } catch {
    return { status: 'error', message: 'เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่' }
  }
  return readResult(res.status, await res.json().catch(() => ({})))
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** ตั้งต้นข้อมูลเครดิต ทำได้ครั้งเดียวตอนที่ยังไม่มีข้อมูล */
export function initCredits(data: CreditsData): Promise<Result> {
  return send('/api/admin/credits', { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(data) })
}

/** แก้หนึ่งรายการ: เพิ่ม บันทึก ลบ หรือจัดลำดับ */
export function applyOp(op: Op): Promise<Result> {
  return send('/api/admin/credits/ops', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(op) })
}

/** ชนิดของรายการที่ใส่รูปได้: ตัวละคร และคน */
export type ImageKind = 'ocs' | 'people'

const ocImagePath = (oc: Pick<Oc, 'id' | 'rev'>, kind: ImageKind) =>
  `/api/admin/credits/${kind}/${encodeURIComponent(oc.id)}/image?rev=${oc.rev}`

/** อัปโหลดรูปและตั้งเป็นรูปของตัวละครทันที รูปเดิมถูกลบจากเซิร์ฟเวอร์ */
export async function setOcImage(oc: Pick<Oc, 'id' | 'rev'>, file: Blob, kind: ImageKind = 'ocs'): Promise<Result> {
  let image: Blob
  try {
    image = await resizeOcImage(file)
  } catch {
    return { status: 'error', message: ERRORS.bad_image }
  }
  return send(ocImagePath(oc, kind), { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: image })
}

/** เอารูปของตัวละครออก และลบรูปนั้นจากเซิร์ฟเวอร์ */
export function removeOcImage(oc: Pick<Oc, 'id' | 'rev'>, kind: ImageKind = 'ocs'): Promise<Result> {
  return send(ocImagePath(oc, kind), { method: 'DELETE' })
}

/** ถามเซิร์ฟเวอร์ว่าบัญชีที่ login อยู่เป็น admin หรือไม่ (เรียกไม่สำเร็จ = ไม่ใช่) */
export async function fetchIsAdmin(): Promise<boolean> {
  return (await fetchRoles()).admin
}

/** บทบาทของบัญชีที่ login อยู่: admin (จัดการข้อมูลเครดิต) และ pieces (จัดการรูปแบบหมาก) แยกจากกัน */
export interface Roles {
  admin: boolean
  pieces: boolean
}

export async function fetchRoles(): Promise<Roles> {
  try {
    const res = await authedFetch('/api/admin/me')
    if (!res.ok) return { admin: false, pieces: false }
    const body = (await res.json()) as { admin?: unknown; pieces?: unknown }
    return { admin: body.admin === true, pieces: body.pieces === true }
  } catch {
    return { admin: false, pieces: false }
  }
}

/** บทบาทของผู้ใช้ปัจจุบัน: null = กำลังตรวจ ผู้เล่นรับเชิญไม่มีบทบาทใด จึงไม่ต้องถามเซิร์ฟเวอร์ */
export function useRoles(): Roles | null {
  const session = useSession()
  const [result, setResult] = useState<{ email: string; roles: Roles } | null>(null)
  const email = session.email
  useEffect(() => {
    if (!email) return
    let alive = true
    fetchRoles().then((roles) => alive && setResult({ email, roles }))
    return () => {
      alive = false
    }
  }, [email])
  if (session.loading) return null
  if (!email) return { admin: false, pieces: false }
  return result && result.email === email ? result.roles : null
}

/**
 * สถานะ admin ของผู้ใช้ปัจจุบัน: null = กำลังตรวจ
 * ผู้เล่นรับเชิญไม่มีทางเป็น admin จึงไม่ต้องถามเซิร์ฟเวอร์
 */
export function useIsAdmin(): boolean | null {
  const roles = useRoles()
  return roles ? roles.admin : null
}

/** ขนาดหลังย่อให้ด้านยาวสุดไม่เกิน `max` โดยคงสัดส่วน (ไม่ขยายรูปเล็ก) */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** ย่อรูปในเบราว์เซอร์เป็น PNG (คงพื้นหลังโปร่ง) ก่อนส่ง */
export async function resizeOcImage(file: Blob, max = OC_IMAGE_SIDE): Promise<Blob> {
  const bitmap = await createImageBitmap(file) // โยน error ถ้าไม่ใช่รูป
  try {
    const size = fitWithin(bitmap.width, bitmap.height, max)
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

// ---------- ตัวช่วยของหน้าแก้ไข ----------

/** ตัวละครที่ยังอ้างถึงคนนี้อยู่ (เป็นเจ้าของหรือผู้วาด) ต้องเปลี่ยนก่อนจึงจะลบคนได้ */
export function ocsUsing(data: CreditsData, personId: string): Oc[] {
  return data.ocs.filter((o) => o.owner === personId || o.artist === personId)
}

/** ลำดับรหัสหลังย้ายรายการที่ตำแหน่ง index ไปทาง delta (-1 ขึ้น, 1 ลง) หรือ null ถ้าย้ายไม่ได้ */
export function orderAfterMove(ids: string[], index: number, delta: number): string[] | null {
  const to = index + delta
  if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return null
  const out = ids.slice()
  ;[out[index], out[to]] = [out[to], out[index]]
  return out
}

/**
 * ค่าที่ผู้แก้พิมพ์ (draft) ต่างจากค่าที่เริ่มแก้ (base) หรือไม่
 * ไม่นับ rev และ image เพราะสองค่านี้เปลี่ยนที่เซิร์ฟเวอร์ ไม่ได้มาจากฟอร์ม
 */
export function isDirty<T extends object>(draft: T, base: T): boolean {
  const strip = (v: T) => JSON.stringify({ ...v, rev: 0, image: '' })
  return strip(draft) !== strip(base)
}

/** ปัญหาของหนึ่งรายการที่เห็นได้ก่อนส่ง (เซิร์ฟเวอร์ตรวจซ้ำอย่างเข้มกว่า) คืนข้อความ หรือ '' */
export function problemIn(kind: Kind, item: Person | TeamGroup | Oc): string {
  if (kind === 'team') return (item as TeamGroup).role.trim() ? '' : 'ยังไม่มีชื่อบทบาท'
  const named = item as Person | Oc
  if (!named.name.trim()) return 'ยังไม่มีชื่อ'
  if (kind === 'people') {
    const link = (item as Person).link.trim()
    if (link && !/^https?:\/\//i.test(link)) return 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://'
  }
  return ''
}

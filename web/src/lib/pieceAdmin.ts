// หน้าจัดการรูปแบบตัวหมาก: เรียก API ที่ต้องเป็นผู้ดูแล (ADMIN_EMAILS)
// เซิร์ฟเวอร์ตรวจบทบาททุกคำขอ ฝั่งนี้แค่ส่งคำขอและแปลผล

import { resizeOcImage } from './admin'
import { authedFetch } from './api'
import { parseRemoteStyles, setRemoteStyles, type RemoteStyle } from './pieceStyles'

/** ด้านยาวสุดของรูปตัวหมากหลังย่อ (พิกเซล) กระดานใหญ่สุดช่องละประมาณ 110px จึงเผื่อจอความละเอียดสูง */
export const PIECE_IMAGE_SIDE = 320
export const STYLE_NAME_MAX = 30

export type PieceResult =
  | { status: 'ok'; styles: RemoteStyle[] }
  | { status: 'conflict'; message: string; styles: RemoteStyle[] | null }
  | { status: 'error'; message: string }

const ERRORS: Record<string, string> = {
  unauthorized: 'ต้องเข้าสู่ระบบก่อน',
  forbidden: 'บัญชีนี้ไม่ใช่ผู้ดูแล',
  bad_image: 'ไฟล์นี้ใช้ไม่ได้ ใช้ได้เฉพาะรูป PNG หรือ JPEG',
  image_too_large: 'รูปใหญ่เกินไป',
  bad_style: 'ชื่อรูปแบบต้องยาว 1 ถึง 30 ตัวอักษร',
  rate_limited: 'กดเร็วเกินไป รอสักครู่แล้วลองใหม่',
  limit: 'มีรูปแบบครบจำนวนสูงสุดแล้ว ลบรูปแบบที่ไม่ใช้ก่อน',
}

/** แปลง response ของ API เป็น PieceResult (แยกออกมาให้ทดสอบได้โดยไม่ต้องมีเซิร์ฟเวอร์) */
export function readPieceResult(status: number, body: unknown): PieceResult {
  const raw = (typeof body === 'object' && body !== null ? body : {}) as { error?: unknown; styles?: unknown }
  const code = typeof raw.error === 'string' ? raw.error : ''
  if (status >= 200 && status < 300) {
    const styles = parseRemoteStyles(raw)
    return styles ? { status: 'ok', styles } : { status: 'error', message: 'เซิร์ฟเวอร์ตอบกลับในรูปแบบที่ไม่รู้จัก' }
  }
  if (status === 409 && code === 'conflict') {
    return { status: 'conflict', message: 'มีคนแก้รูปแบบนี้ไปก่อน แสดงข้อมูลล่าสุดให้แล้ว ลองทำอีกครั้ง', styles: parseRemoteStyles(raw) }
  }
  return { status: 'error', message: ERRORS[code] ?? 'ไม่สำเร็จ ลองใหม่อีกครั้ง' }
}

async function send(path: string, init: RequestInit): Promise<PieceResult> {
  let res: Response
  try {
    res = await authedFetch(path, init)
  } catch {
    return { status: 'error', message: 'เชื่อมต่อไม่ได้ เช็กเน็ตแล้วลองใหม่' }
  }
  const result = readPieceResult(res.status, await res.json().catch(() => ({})))
  // ให้ตัวเลือกในหน้าโปรไฟล์และกระดานของแท็บนี้เห็นข้อมูลล่าสุดทันที
  if (result.status === 'ok') setRemoteStyles(result.styles)
  else if (result.status === 'conflict' && result.styles) setRemoteStyles(result.styles)
  return result
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const stylePath = (s: Pick<RemoteStyle, 'id' | 'rev'>, rest = '') => `/api/pieces/styles/${encodeURIComponent(s.id)}${rest}?rev=${s.rev}`

/** โหลดรูปแบบทั้งหมด (ทุกคนอ่านได้) */
export async function fetchStyles(): Promise<RemoteStyle[]> {
  const res = await fetch('/api/piece-styles')
  if (!res.ok) throw new Error('load failed')
  const styles = parseRemoteStyles(await res.json())
  if (!styles) throw new Error('bad response')
  return styles
}

export function createStyle(name: string): Promise<PieceResult> {
  return send('/api/pieces/styles', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ name }) })
}

export function renameStyle(style: Pick<RemoteStyle, 'id' | 'rev'>, name: string): Promise<PieceResult> {
  return send(stylePath(style), { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ name }) })
}

export function deleteStyle(style: Pick<RemoteStyle, 'id' | 'rev'>): Promise<PieceResult> {
  return send(stylePath(style), { method: 'DELETE' })
}

/** อัปโหลดรูปของหมากหนึ่งตัว (เช่น 'wK') รูปเดิมของตัวนั้นถูกลบจากเซิร์ฟเวอร์ */
export async function setPieceImage(style: Pick<RemoteStyle, 'id' | 'rev'>, piece: string, file: Blob): Promise<PieceResult> {
  let image: Blob
  try {
    image = await resizeOcImage(file, PIECE_IMAGE_SIDE)
  } catch {
    return { status: 'error', message: ERRORS.bad_image }
  }
  return send(stylePath(style, `/images/${piece}`), { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: image })
}

export function removePieceImage(style: Pick<RemoteStyle, 'id' | 'rev'>, piece: string): Promise<PieceResult> {
  return send(stylePath(style, `/images/${piece}`), { method: 'DELETE' })
}

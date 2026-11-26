// ชื่อที่แสดงและรูปโปรไฟล์ของผู้ใช้ที่ login (เก็บที่ Go server)

import { authedFetch } from './api'

export interface Profile {
  name: string
  /** รหัสรูป ('' = ไม่มีรูป) */
  avatar: string
}

export const NAME_MIN = 3
export const NAME_MAX = 20
/** ด้านของรูปที่ส่งขึ้นเซิร์ฟเวอร์ (พิกเซล) */
export const AVATAR_SIDE = 256

export function avatarUrl(id: string): string {
  return `/api/avatars/${id}`
}

const ERRORS: Record<string, string> = {
  bad_name: `ชื่อต้องยาว ${NAME_MIN}–${NAME_MAX} ตัวอักษร ใช้ได้เฉพาะตัวอักษร ตัวเลข ช่องว่าง และ _ - .`,
  bad_image: 'ไฟล์นี้ใช้ไม่ได้ เลือกรูป JPEG หรือ PNG',
  image_too_large: 'รูปใหญ่เกินไป ลองรูปอื่น',
  account_required: 'ต้องเข้าสู่ระบบก่อน',
  unauthorized: 'เซสชันหมดอายุ ออกจากระบบแล้วเข้าใหม่',
}

export class ProfileError extends Error {}

async function request(path: string, init?: RequestInit): Promise<Profile> {
  let res: Response
  try {
    res = await authedFetch(path, init)
  } catch {
    throw new ProfileError('เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่')
  }
  const body = (await res.json().catch(() => ({}))) as Partial<Profile> & { error?: string }
  if (!res.ok) {
    throw new ProfileError(ERRORS[body.error ?? ''] ?? 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
  }
  return { name: body.name ?? '', avatar: body.avatar ?? '' }
}

export const fetchProfile = () => request('/api/profile')

export const saveName = (name: string) =>
  request('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })

export const deleteAvatar = () => request('/api/profile/avatar', { method: 'DELETE' })

/** ย่อรูปในเบราว์เซอร์แล้วอัปโหลด */
export async function uploadAvatar(file: Blob): Promise<Profile> {
  let small: Blob
  try {
    small = await resizeAvatar(file)
  } catch {
    throw new ProfileError(ERRORS.bad_image)
  }
  return request('/api/profile/avatar', {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: small,
  })
}

/** ส่วนของรูปต้นฉบับที่จะใช้: สี่เหลี่ยมจัตุรัสใหญ่สุดตรงกลาง */
export function centerSquare(width: number, height: number) {
  const side = Math.min(width, height)
  return { x: (width - side) / 2, y: (height - side) / 2, side }
}

/**
 * ตัดรูปเป็นสี่เหลี่ยมจัตุรัสตรงกลางและย่อเป็น JPEG ขนาด AVATAR_SIDE
 * การวาดลง canvas ทิ้งข้อมูลแฝงของไฟล์ (เช่น ตำแหน่งที่ถ่าย) ไปด้วย เซิร์ฟเวอร์เข้ารหัสใหม่ซ้ำอีกชั้น
 */
export async function resizeAvatar(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file) // โยน error ถ้าไม่ใช่รูป
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = AVATAR_SIDE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    // JPEG ไม่มีความโปร่งใส ส่วนที่โปร่งใสจึงถมด้วยสีขาว
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, AVATAR_SIDE, AVATAR_SIDE)
    const { x, y, side } = centerSquare(bitmap.width, bitmap.height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, x, y, side, side, 0, 0, AVATAR_SIDE, AVATAR_SIDE)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85),
    )
  } finally {
    bitmap.close()
  }
}

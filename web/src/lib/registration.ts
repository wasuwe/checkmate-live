// การตรวจฟอร์มสมัครสมาชิกฝั่งหน้าเว็บ (Supabase และ Go server ตรวจซ้ำอีกชั้น)

import { NAME_MAX, NAME_MIN } from './profile'

/**
 * รูปแบบอีเมล: ส่วนหน้า @ ไม่ขึ้นต้นหรือลงท้ายด้วยจุดและไม่มีจุดติดกัน โดเมนมีอย่างน้อยสองส่วน
 * แต่ละส่วนเป็นตัวอักษร ตัวเลข หรือขีด (ไม่ขึ้นต้นหรือลงท้ายด้วยขีด) และส่วนท้ายเป็นตัวอักษรอย่างน้อยสองตัว
 */
export const EMAIL_PATTERN =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/
export const EMAIL_MAX = 254
export const PASSWORD_MIN = 8
/** bcrypt ที่ผู้ให้บริการบัญชีใช้ อ่านรหัสผ่านได้ไม่เกิน 72 ไบต์ */
export const PASSWORD_MAX = 72

export type RegisterField = 'name' | 'email' | 'password' | 'confirm'

/** เงื่อนไขของรหัสผ่าน แสดงเป็นรายการใต้ช่องให้เห็นว่าผ่านข้อไหนแล้ว */
export interface PasswordCheck {
  id: 'length' | 'letter' | 'digit'
  label: string
  ok: boolean
}

export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { id: 'length', label: `ยาวอย่างน้อย ${PASSWORD_MIN} ตัว`, ok: password.length >= PASSWORD_MIN },
    { id: 'letter', label: 'มีตัวอักษร', ok: /\p{L}/u.test(password) },
    { id: 'digit', label: 'มีตัวเลข', ok: /\p{Nd}/u.test(password) },
  ]
}

/** ข้อความผิดพลาดของอีเมล หรือ undefined ถ้าใช้ได้ */
export function emailError(email: string): string | undefined {
  const value = email.trim()
  if (value === '') return 'กรุณากรอกอีเมล'
  if (/\s/.test(value)) return 'อีเมลต้องไม่มีช่องว่าง'
  if (!value.includes('@')) return 'อีเมลต้องมี @ เช่น you@example.com'
  if (value.length > EMAIL_MAX || !EMAIL_PATTERN.test(value)) return 'รูปแบบอีเมลไม่ถูกต้อง เช่น you@example.com'
  return undefined
}

/** ข้อความผิดพลาดของรหัสผ่าน หรือ undefined ถ้าใช้ได้ */
export function passwordError(password: string): string | undefined {
  if (password === '') return 'กรุณาตั้งรหัสผ่าน'
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return 'รหัสผ่านยาวเกินไป'
  if (password !== password.trim()) return 'รหัสผ่านต้องไม่ขึ้นต้นหรือลงท้ายด้วยช่องว่าง'
  const missing = passwordChecks(password).filter((c) => !c.ok)
  if (missing.length > 0) return `รหัสผ่านต้อง${missing.map((c) => c.label).join(' และ')}`
  return undefined
}

/** ข้อความผิดพลาดของช่องเดียว (ใช้ตรวจตอนออกจากช่อง) */
export function validateField(field: RegisterField, v: Record<RegisterField, string>): string | undefined {
  switch (field) {
    case 'name': {
      const length = [...v.name.trim()].length
      // ชื่อไม่บังคับ แต่ถ้ากรอกต้องยาวตามที่เซิร์ฟเวอร์รับ
      return length !== 0 && (length < NAME_MIN || length > NAME_MAX) ? `ชื่อต้องยาว ${NAME_MIN}–${NAME_MAX} ตัวอักษร` : undefined
    }
    case 'email':
      return emailError(v.email)
    case 'password':
      return passwordError(v.password)
    case 'confirm':
      if (v.confirm === '') return 'กรุณาพิมพ์รหัสผ่านอีกครั้ง'
      return v.confirm !== v.password ? 'รหัสผ่านสองช่องไม่ตรงกัน' : undefined
  }
}

/** คืนข้อความผิดพลาดของแต่ละช่อง ช่องที่ถูกต้องไม่มี key */
export function validateRegistration(
  v: Record<RegisterField, string>,
): Partial<Record<RegisterField, string>> {
  const errors: Partial<Record<RegisterField, string>> = {}
  for (const field of ['name', 'email', 'password', 'confirm'] as const) {
    const message = validateField(field, v)
    if (message) errors[field] = message
  }
  return errors
}

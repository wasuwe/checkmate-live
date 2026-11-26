// การตรวจฟอร์มสมัครสมาชิกฝั่งหน้าเว็บ (Supabase และ Go server ตรวจซ้ำอีกชั้น)

import { NAME_MAX, NAME_MIN } from './profile'

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PASSWORD_MIN = 8

export type RegisterField = 'name' | 'email' | 'password' | 'confirm'

/** คืนข้อความผิดพลาดของแต่ละช่อง ช่องที่ถูกต้องไม่มี key */
export function validateRegistration(
  v: Record<RegisterField, string>,
): Partial<Record<RegisterField, string>> {
  const errors: Partial<Record<RegisterField, string>> = {}
  const nameLength = [...v.name.trim()].length
  // ชื่อไม่บังคับ แต่ถ้ากรอกต้องยาวตามที่เซิร์ฟเวอร์รับ
  if (nameLength !== 0 && (nameLength < NAME_MIN || nameLength > NAME_MAX)) {
    errors.name = `ชื่อต้องยาว ${NAME_MIN}–${NAME_MAX} ตัวอักษร`
  }
  if (!EMAIL_PATTERN.test(v.email.trim())) errors.email = 'อีเมลไม่ถูกต้อง'
  if (v.password.length < PASSWORD_MIN) errors.password = `รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN} ตัว`
  if (v.confirm !== v.password) errors.confirm = 'รหัสผ่านสองช่องไม่ตรงกัน'
  return errors
}

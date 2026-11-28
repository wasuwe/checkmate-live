// รหัสของเครื่อง (เบราว์เซอร์) นี้ ใช้ให้เซิร์ฟเวอร์แยกว่าผู้ใช้คนเดียวกันเข้าห้องจากอีกเครื่อง หรือจากอีกแท็บของเครื่องเดิม
// ไม่ใช่ตัวตนและไม่ใช้ยืนยันอะไร: สุ่มครั้งแรกแล้วเก็บไว้ใน localStorage ทุกแท็บของเบราว์เซอร์เดียวกันจึงได้รหัสเดียวกัน

const DEVICE_KEY = 'checkmate.device'
const DEVICE_RE = /^[A-Za-z0-9_-]{8,40}$/
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

let cached: string | null = null

function randomId(): string {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

/** รหัสเครื่อง ถ้า localStorage ใช้ไม่ได้ (โหมดส่วนตัวบางแบบ) รหัสอยู่แค่ในหน่วยความจำของแท็บนี้ */
export function deviceId(): string {
  if (cached) return cached
  try {
    const stored = localStorage.getItem(DEVICE_KEY)
    if (stored && DEVICE_RE.test(stored)) return (cached = stored)
  } catch {
    // อ่านไม่ได้: สุ่มใหม่ด้านล่าง
  }
  const id = randomId()
  try {
    localStorage.setItem(DEVICE_KEY, id)
  } catch {
    // เก็บไม่ได้ก็ยังใช้รหัสนี้ได้จนกว่าจะปิดแท็บ
  }
  return (cached = id)
}

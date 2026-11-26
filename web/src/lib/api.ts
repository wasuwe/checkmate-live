// เรียก HTTP API ของ Go server และจัดการตัวตน guest
// เฟส 4 จะเปลี่ยน getToken ไปใช้ session ของ Supabase Auth โดยส่วนอื่นไม่ต้องแก้

const GUEST_KEY = 'checkmate.guest'

interface Guest {
  userId: string
  token: string
}

function readGuest(): Guest | null {
  try {
    const raw = localStorage.getItem(GUEST_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<Guest>
    if (typeof value.userId === 'string' && typeof value.token === 'string') {
      return { userId: value.userId, token: value.token }
    }
  } catch {
    // ข้อมูลเสียหรือ localStorage ใช้ไม่ได้: ขอตัวตนใหม่
  }
  return null
}

let pending: Promise<Guest> | null = null

async function requestGuest(): Promise<Guest> {
  const res = await fetch('/api/guest', { method: 'POST' })
  if (!res.ok) throw new Error(`guest request failed: ${res.status}`)
  const guest = (await res.json()) as Guest
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(guest))
  } catch {
    // เก็บไม่ได้ก็ยังเล่นได้ แค่ปิดแท็บแล้วจะกลับที่นั่งเดิมไม่ได้
  }
  return guest
}

/**
 * คืน token ของผู้ใช้ปัจจุบัน ถ้ายังไม่มีจะขอตัวตน guest ใหม่
 * `forceNew` ใช้เมื่อเซิร์ฟเวอร์ปฏิเสธ token เดิม (เช่น เซิร์ฟเวอร์รีสตาร์ต)
 */
export async function getToken(forceNew = false): Promise<string> {
  if (!forceNew) {
    const saved = readGuest()
    if (saved) return saved.token
  }
  // หลายที่ขอพร้อมกันต้องได้ตัวตนเดียวกัน
  pending ??= requestGuest().finally(() => {
    pending = null
  })
  return (await pending).token
}

/** สร้างห้องใหม่ คืนรหัสห้อง */
export async function createRoom(): Promise<string> {
  for (const forceNew of [false, true]) {
    const token = await getToken(forceNew)
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401 && !forceNew) continue // token เก่าใช้ไม่ได้แล้ว ลองใหม่ด้วยตัวตนใหม่
    if (!res.ok) throw new Error(`create room failed: ${res.status}`)
    const body = (await res.json()) as { roomId: string }
    return body.roomId
  }
  throw new Error('create room failed: unauthorized')
}

export function socketUrl(): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${location.host}/ws`
}

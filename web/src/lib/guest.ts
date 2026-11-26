// ตัวตนชั่วคราวของผู้เล่นที่ไม่ได้ login เซิร์ฟเวอร์เป็นผู้ออกและเซ็นกำกับ

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
 * คืน token ของ guest ถ้ายังไม่มีจะขอตัวตนใหม่
 * `forceNew` ใช้เมื่อเซิร์ฟเวอร์ปฏิเสธ token เดิม (เช่น เซิร์ฟเวอร์รีสตาร์ต)
 */
export async function getGuestToken(forceNew = false): Promise<string> {
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

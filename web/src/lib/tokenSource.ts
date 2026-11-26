// เลือก token ที่จะส่งให้ Go server: ของผู้ใช้ที่ login ถ้ามี ไม่งั้นใช้ของ guest

/** ส่วนของ Supabase Auth ที่ใช้จริง แยกไว้เพื่อให้ test ใส่ตัวปลอมได้ */
export interface AuthLike {
  getSession(): Promise<{ data: { session: { access_token: string } | null } }>
  refreshSession(): Promise<{ data: { session: { access_token: string } | null } }>
}

export interface TokenSourceDeps {
  /** null เมื่อไม่ได้ตั้งค่า Supabase (เล่นแบบ guest อย่างเดียว) */
  auth: AuthLike | null
  guestToken: (forceNew: boolean) => Promise<string>
}

/**
 * คืนฟังก์ชัน getToken
 * `forceNew` แปลว่าเซิร์ฟเวอร์เพิ่งปฏิเสธ token ล่าสุด: ผู้ใช้ที่ login จะขอ token ใหม่จาก Supabase
 * ถ้าขอไม่ได้ (session หมดอายุจริง) จะถอยไปใช้ตัวตน guest
 */
export function createTokenSource({ auth, guestToken }: TokenSourceDeps) {
  return async function getToken(forceNew = false): Promise<string> {
    if (auth) {
      try {
        const { data } = forceNew ? await auth.refreshSession() : await auth.getSession()
        if (data.session) return data.session.access_token
      } catch {
        // ติดต่อ Supabase ไม่ได้: ถอยไปใช้ guest ด้านล่าง
      }
      // login อยู่แต่ refresh ไม่ผ่าน: token ของ guest ที่เก็บไว้ยังใช้ได้ ไม่ต้องขอใหม่
      if (forceNew) return guestToken(false)
    }
    return guestToken(forceNew)
  }
}

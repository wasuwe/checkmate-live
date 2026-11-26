import { useState, type FormEvent } from 'react'
import { ProfileEditor } from './ProfileEditor'
import { loginAvailable, signIn, signOut, signUp, useSession, type AuthResult } from '../lib/session'

type Mode = 'signin' | 'signup'

/** การ์ดบัญชีผู้ใช้ในหน้าแรก ไม่แสดงเลยถ้าไม่ได้ตั้งค่า Supabase */
export function AccountPanel() {
  const session = useSession()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!loginAvailable || session.loading) return null

  if (session.email !== null) {
    return (
      <section className="card">
        <h2>บัญชีของคุณ</h2>
        <p>
          เข้าสู่ระบบในชื่อ <strong>{session.email}</strong>
        </p>
        <ProfileEditor />
        <button type="button" onClick={() => void signOut()}>
          ออกจากระบบ
        </button>
      </section>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    let result: AuthResult
    try {
      result = await (mode === 'signin' ? signIn(email, password) : signUp(email, password))
    } catch {
      result = { ok: false, message: 'เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่' }
    }
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
    } else if (result.needsEmailConfirm) {
      setPassword('')
      setNotice('ส่งลิงก์ยืนยันไปที่อีเมลแล้ว เปิดลิงก์นั้นแล้วกลับมาเข้าสู่ระบบ')
      setMode('signin')
    }
  }

  const signup = mode === 'signup'
  return (
    <section className="card">
      <h2>{signup ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</h2>
      <p>ไม่บังคับ เล่นได้เลยโดยไม่ต้องมีบัญชี บัญชีจะใช้เก็บประวัติเกมในภายหลัง</p>
      <form onSubmit={onSubmit} className="join">
        <label htmlFor="account-email">อีเมล</label>
        <input
          id="account-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="account-password">รหัสผ่าน</label>
        <input
          id="account-password"
          type="password"
          required
          minLength={8}
          autoComplete={signup ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        <div className="row">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'กำลังดำเนินการ…' : signup ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}
          </button>
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode(signup ? 'signin' : 'signup')
              setError(null)
            }}
          >
            {signup ? 'มีบัญชีแล้ว เข้าสู่ระบบ' : 'ยังไม่มีบัญชี สมัครสมาชิก'}
          </button>
        </div>
      </form>
    </section>
  )
}

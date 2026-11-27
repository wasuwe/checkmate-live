import { PieceIcon } from '../components/PieceIcon'
import { useEffect, useState, type FormEvent } from 'react'
import { PasswordInput } from '../components/PasswordInput'
import { StageScene } from '../components/StageScene'
import { useMe } from '../lib/me'
import { EMAIL_PATTERN } from '../lib/registration'
import { loginAvailable, signIn, type AuthResult } from '../lib/session'

interface Props {
  navigate: (to: string) => void
}

export function LoginPage({ navigate }: Props) {
  const me = useMe()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // login อยู่แล้ว (หรือเพิ่ง login สำเร็จ) ไม่มีอะไรให้ทำในหน้านี้
  const signedIn = me.email !== null
  useEffect(() => {
    if (signedIn) navigate('/')
  }, [signedIn, navigate])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!EMAIL_PATTERN.test(email.trim())) {
      setEmailError('อีเมลไม่ถูกต้อง')
      return
    }
    setBusy(true)
    let result: AuthResult
    try {
      result = await signIn(email.trim(), password)
    } catch {
      result = { ok: false, message: 'เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่' }
    }
    setBusy(false)
    if (!result.ok) setError(result.message)
  }

  return (
    <main className="screen auth login">
      {/* ฉากเวทีด้านซ้าย แสดงเฉพาะจอกว้าง */}
      <StageScene className="auth-scene">
        <span className="stage-actor">
          <PieceIcon kind="K" />
        </span>
      </StageScene>
      <div className="auth-head">
        <div className="medal" style={{ background: 'var(--butter)' }} aria-hidden="true">
          <PieceIcon kind="K" color="b" />
        </div>
        <h1 className="title">เข้าสู่ระบบ</h1>
        <p className="small center pretty">
          ไม่บังคับ เล่นได้เลยโดยไม่ต้องมีบัญชี บัญชีใช้ตั้งชื่อและรูปโปรไฟล์ที่คู่แข่งเห็น
        </p>
      </div>

      {loginAvailable ? (
        <form className="card" onSubmit={onSubmit} noValidate>
          <label className="field" htmlFor="login-email">
            อีเมล
            <input
              id="login-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setEmailError(null)
              }}
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? 'login-email-error' : undefined}
            />
            {emailError && (
              <span className="error" id="login-email-error" role="alert">
                {emailError}
              </span>
            )}
          </label>
          <label className="field" htmlFor="login-password">
            รหัสผ่าน
            <PasswordInput
              id="login-password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </label>
          {error && (
            <p className="error anim-shake" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn pink strong" disabled={busy || password === ''}>
            {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      ) : (
        <p className="card center">ระบบสมาชิกยังไม่เปิดใช้งาน เล่นแบบผู้เล่นรับเชิญได้เลย</p>
      )}

      <p className="center">
        ยังไม่มีบัญชี?{' '}
        <button type="button" className="link" onClick={() => navigate('/register')}>
          สมัครสมาชิก
        </button>
      </p>
    </main>
  )
}

import { useEffect, useState, type FormEvent } from 'react'
import { PasswordInput } from '../components/PasswordInput'
import { setPendingName, useMe } from '../lib/me'
import { VS } from '../lib/pieceSets'
import { NAME_MAX } from '../lib/profile'
import { PASSWORD_MIN, validateRegistration, type RegisterField } from '../lib/registration'
import { loginAvailable, signUp, type AuthResult } from '../lib/session'
import { termsAccepted, setTermsAccepted } from '../lib/terms'

interface Props {
  navigate: (to: string) => void
}

type Field = RegisterField

export function RegisterPage({ navigate }: Props) {
  const me = useMe()
  const [values, setValues] = useState<Record<Field, string>>({ name: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [accepted, setAccepted] = useState(termsAccepted)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const signedIn = me.email !== null
  useEffect(() => {
    if (signedIn) navigate('/')
  }, [signedIn, navigate])

  function change(field: Field, value: string) {
    setValues((v) => ({ ...v, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setNotice(null)
    const found = validateRegistration(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    if (!accepted) {
      setFormError('กรุณายอมรับข้อตกลงการใช้งานก่อนสร้างบัญชี')
      return
    }

    setBusy(true)
    // ชื่อบันทึกหลัง login สำเร็จ (ทันที หรือหลังยืนยันอีเมล) เพราะต้องใช้ token ของบัญชี
    setPendingName(values.name.trim())
    let result: AuthResult
    try {
      result = await signUp(values.email.trim(), values.password)
    } catch {
      result = { ok: false, message: 'เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่' }
    }
    setBusy(false)
    if (!result.ok) {
      setFormError(result.message)
    } else if (result.needsEmailConfirm) {
      setValues((v) => ({ ...v, password: '', confirm: '' }))
      setNotice('ส่งลิงก์ยืนยันไปที่อีเมลแล้ว เปิดลิงก์นั้นแล้วกลับมาเข้าสู่ระบบ')
    }
  }

  function text(field: Field, label: string, props: { type?: string; placeholder: string; autoComplete: string }) {
    const id = `register-${field}`
    return (
      <label className="field" htmlFor={id}>
        {label}
        <input
          id={id}
          className="input"
          type={props.type ?? 'text'}
          value={values[field]}
          onChange={(e) => change(field, e.target.value)}
          placeholder={props.placeholder}
          autoComplete={props.autoComplete}
          maxLength={field === 'name' ? NAME_MAX : undefined}
          aria-invalid={errors[field] ? true : undefined}
          aria-describedby={errors[field] ? `${id}-error` : undefined}
        />
        {errors[field] && (
          <span className="error" id={`${id}-error`} role="alert">
            {errors[field]}
          </span>
        )}
      </label>
    )
  }

  function password(field: 'password' | 'confirm', label: string, placeholder: string) {
    const id = `register-${field}`
    return (
      <label className="field" htmlFor={id}>
        {label}
        <PasswordInput
          id={id}
          value={values[field]}
          onChange={(v) => change(field, v)}
          placeholder={placeholder}
          autoComplete="new-password"
          invalid={!!errors[field]}
          describedBy={errors[field] ? `${id}-error` : undefined}
        />
        {errors[field] && (
          <span className="error" id={`${id}-error`} role="alert">
            {errors[field]}
          </span>
        )}
      </label>
    )
  }

  return (
    <main className="screen" style={{ paddingTop: 12 }}>
      <div className="auth-head">
        <div className="medal" style={{ background: 'var(--mint)' }} aria-hidden="true">
          {'♟' + VS}
        </div>
        <h1 className="title">สมัครสมาชิก</h1>
        <p className="small center">สร้างบัญชีเพื่อตั้งชื่อและรูปโปรไฟล์ที่คู่แข่งเห็น</p>
      </div>

      {loginAvailable ? (
        <form className="card" onSubmit={onSubmit} noValidate>
          {text('name', 'ชื่อที่แสดง (ไม่บังคับ)', { placeholder: 'เช่น ม้าน้อยใจกล้า', autoComplete: 'nickname' })}
          {text('email', 'อีเมล', { type: 'email', placeholder: 'you@example.com', autoComplete: 'email' })}
          <div className="fields-2">
            {password('password', 'รหัสผ่าน', `อย่างน้อย ${PASSWORD_MIN} ตัว`)}
            {password('confirm', 'ยืนยันรหัสผ่าน', 'พิมพ์อีกครั้ง')}
          </div>
          <div className="row small">
            <button
              type="button"
              className="check"
              role="checkbox"
              aria-checked={accepted}
              aria-label="ยอมรับข้อตกลงการใช้งาน"
              onClick={() => {
                setAccepted(!accepted)
                setTermsAccepted(!accepted)
                setFormError(null)
              }}
            >
              {accepted ? '✓' : ''}
            </button>
            <span>
              ฉันได้อ่านและยอมรับ{' '}
              <button type="button" className="link" onClick={() => navigate('/terms')}>
                ข้อตกลงการใช้งาน
              </button>
            </span>
          </div>
          {formError && (
            <p className="error anim-shake" role="alert">
              {formError}
            </p>
          )}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          <button type="submit" className="btn butter strong" disabled={busy}>
            {busy ? 'กำลังสร้างบัญชี…' : 'สร้างบัญชี'}
          </button>
        </form>
      ) : (
        <p className="card center">ระบบสมาชิกยังไม่เปิดใช้งาน เล่นแบบผู้เล่นรับเชิญได้เลย</p>
      )}

      <p className="center">
        มีบัญชีอยู่แล้ว?{' '}
        <button type="button" className="link" onClick={() => navigate('/login')}>
          เข้าสู่ระบบ
        </button>
      </p>
    </main>
  )
}

import { useState } from 'react'

interface Props {
  id: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  autoComplete: 'current-password' | 'new-password'
  invalid?: boolean
  describedBy?: string
}

/** ช่องรหัสผ่านพร้อมปุ่มแสดง/ซ่อน */
export function PasswordInput({ id, value, onChange, onBlur, placeholder, autoComplete, invalid, describedBy }: Props) {
  const [shown, setShown] = useState(false)
  return (
    <span className="input-wrap">
      <input
        id={id}
        className="input"
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
      <button type="button" className="peek" aria-pressed={shown} onClick={() => setShown(!shown)}>
        {shown ? 'ซ่อน' : 'แสดง'}
      </button>
    </span>
  )
}

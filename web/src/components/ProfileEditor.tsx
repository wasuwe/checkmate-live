import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  deleteAvatar,
  fetchProfile,
  NAME_MAX,
  NAME_MIN,
  ProfileError,
  saveName,
  uploadAvatar,
  type Profile,
} from '../lib/profile'
import { Avatar } from './Avatar'

/** ฟอร์มตั้งชื่อที่แสดงและรูปโปรไฟล์ ใช้ได้เมื่อ login แล้วเท่านั้น */
export function ProfileEditor() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    fetchProfile()
      .then((p) => {
        if (cancelled) return
        setProfile(p)
        setName(p.name)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(message(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  /** รันคำสั่งที่เปลี่ยนโปรไฟล์ แล้วแสดงผลลัพธ์ */
  async function run(action: () => Promise<Profile>, done: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const next = await action()
      setProfile(next)
      setName(next.name)
      setNotice(done)
    } catch (err) {
      setError(message(err))
    }
    setBusy(false)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void run(() => saveName(name), 'บันทึกชื่อแล้ว')
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // เลือกไฟล์เดิมซ้ำได้
    if (file) void run(() => uploadAvatar(file), 'เปลี่ยนรูปแล้ว')
  }

  if (profile === null) {
    return error ? (
      <p className="error" role="alert">
        โหลดโปรไฟล์ไม่ได้: {error}
      </p>
    ) : (
      <p role="status">กำลังโหลดโปรไฟล์…</p>
    )
  }

  const trimmed = name.trim()
  const unchanged = trimmed === profile.name
  return (
    <div className="profile">
      <div className="profile-avatar">
        <Avatar avatar={profile.avatar} name={profile.name || '?'} size={72} />
        <div className="profile-avatar-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            aria-label="เลือกรูปโปรไฟล์"
            onChange={onFile}
          />
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
            {profile.avatar ? 'เปลี่ยนรูป' : 'ใส่รูป'}
          </button>
          {profile.avatar && (
            <button
              type="button"
              className="link"
              disabled={busy}
              onClick={() => void run(deleteAvatar, 'ลบรูปแล้ว')}
            >
              ลบรูป
            </button>
          )}
        </div>
      </div>

      <form onSubmit={onSubmit} className="join">
        <label htmlFor="profile-name">ชื่อที่แสดงในห้อง</label>
        <div className="row">
          <input
            id="profile-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNotice(null)
            }}
            maxLength={NAME_MAX}
            placeholder={`${NAME_MIN}–${NAME_MAX} ตัวอักษร`}
            autoComplete="nickname"
          />
          <button type="submit" disabled={busy || unchanged}>
            บันทึกชื่อ
          </button>
        </div>
      </form>
      <p className="hint">คู่แข่งและผู้ชมเห็นชื่อและรูปนี้ รูปจะถูกตัดเป็นสี่เหลี่ยมจัตุรัสตรงกลาง</p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  )
}

function message(err: unknown): string {
  return err instanceof ProfileError ? err.message : 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง'
}

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { setMyProfile, useMe } from '../lib/me'
import { PieceIcon } from './PieceIcon'
import {
  AVATAR_PRESETS,
  deleteAvatar,
  NAME_MAX,
  NAME_MIN,
  presetAvatarBlob,
  ProfileError,
  saveName,
  uploadAvatar,
  type Profile,
} from '../lib/profile'
import { Avatar } from './Avatar'
import { CropDialog } from './CropDialog'

/** ฟอร์มตั้งชื่อในเกมและรูปโปรไฟล์ ใช้ได้เมื่อ login แล้วเท่านั้น */
export function ProfileEditor() {
  const me = useMe()
  const profile = me.profile
  // ชื่อที่กำลังพิมพ์ null = ยังไม่ได้แก้ ใช้ชื่อที่บันทึกไว้
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const name = draft ?? profile.name

  /** รันคำสั่งที่เปลี่ยนโปรไฟล์ แล้วแสดงผลลัพธ์ */
  async function run(action: () => Promise<Profile>, done: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      setMyProfile(await action())
      setDraft(null)
      setNotice(done)
    } catch (err) {
      setError(err instanceof ProfileError ? err.message : 'มีบางอย่างผิดพลาด ลองใหม่อีกครั้ง')
    }
    setBusy(false)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void run(() => saveName(name), 'บันทึกชื่อแล้ว')
  }

  /** ไฟล์ที่เลือกไว้และกำลังครอป */
  const [cropping, setCropping] = useState<Blob | null>(null)

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // เลือกไฟล์เดิมซ้ำได้
    if (file) setCropping(file)
  }

  return (
    <section className="card profile-top profile" aria-label="ชื่อและรูปโปรไฟล์">
      {cropping && (
        <CropDialog
          file={cropping}
          aspect={1}
          round
          maxSide={512}
          title="ครอปรูปโปรไฟล์"
          onCancel={() => setCropping(null)}
          onDone={(image) => {
            setCropping(null)
            void run(() => uploadAvatar(image), 'เปลี่ยนรูปแล้ว')
          }}
        />
      )}
      <Avatar avatar={profile.avatar} size={110} className="profile-photo" />
      <div className="profile-fields">
        <form onSubmit={onSubmit} className="stack" style={{ gap: 6 }}>
          <label className="field" htmlFor="profile-name">
            ชื่อในเกม
          </label>
          <div className="row">
            <input
              id="profile-name"
              className="input"
              value={name}
              onChange={(e) => {
                setDraft(e.target.value)
                setNotice(null)
              }}
              maxLength={NAME_MAX}
              placeholder={`${NAME_MIN} ถึง ${NAME_MAX} ตัวอักษร`}
              autoComplete="nickname"
            />
            <button type="submit" className="btn mini" disabled={busy || name.trim() === profile.name}>
              บันทึกชื่อ
            </button>
          </div>
        </form>

        <div className="field" id="avatar-label">
          รูปโปรไฟล์
        </div>
        <div className="row wrap" role="group" aria-labelledby="avatar-label" style={{ gap: 10 }}>
          {AVATAR_PRESETS.map((a) => (
            <button
              key={a.kind}
              type="button"
              className="avatar-choice"
              style={{ background: a.bg }}
              aria-label={`ใช้รูป${a.name}`}
              disabled={busy}
              onClick={(e) => {
                const svg = e.currentTarget.querySelector('svg')
                if (svg) void run(async () => uploadAvatar(await presetAvatarBlob(svg, a.bg)), 'เปลี่ยนรูปแล้ว')
              }}
            >
              <PieceIcon kind={a.kind} />
            </button>
          ))}
        </div>
        <div className="row wrap">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            aria-label="เลือกรูปโปรไฟล์"
            onChange={onFile}
          />
          <button type="button" className="btn mini" disabled={busy} onClick={() => fileRef.current?.click()}>
            อัปโหลดรูปเอง
          </button>
          {profile.avatar && (
            <button type="button" className="link small" disabled={busy} onClick={() => void run(deleteAvatar, 'ลบรูปแล้ว')}>
              ลบรูป
            </button>
          )}
        </div>
        <p className="tiny pretty">คู่แข่งและผู้ชมจะเห็นชื่อและรูปนี้ รูปที่อัปโหลดเองครอปได้</p>

        {error && (
          <p className="error anim-shake" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
      </div>
    </section>
  )
}

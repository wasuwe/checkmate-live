import { useState, type FormEvent } from 'react'
import { AccountPanel } from '../components/AccountPanel'
import { createRoom } from '../lib/api'
import { APP_NAME } from '../lib/appInfo'
import { DEFAULT_TIME_CONTROL, TIME_CONTROLS } from '../lib/clock'
import { extractRoomId } from '../lib/protocol'
import { roomPath } from '../lib/router'

interface Props {
  navigate: (to: string) => void
}

export function HomePage({ navigate }: Props) {
  const [creating, setCreating] = useState(false)
  const [timeControl, setTimeControl] = useState(DEFAULT_TIME_CONTROL)
  const [createError, setCreateError] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState(false)

  async function onCreate() {
    setCreating(true)
    setCreateError(false)
    try {
      navigate(roomPath(await createRoom(timeControl)))
    } catch {
      setCreateError(true)
      setCreating(false)
    }
  }

  function onJoin(e: FormEvent) {
    e.preventDefault()
    const roomId = extractRoomId(code)
    if (roomId === null) {
      setCodeError(true)
      return
    }
    navigate(roomPath(roomId))
  }

  return (
    <main className="page home">
      <h1>{APP_NAME}</h1>
      <p className="lead">เล่นหมากรุกกับเพื่อนผ่านลิงก์ ไม่ต้องสมัครสมาชิก</p>

      <section className="card">
        <h2>เริ่มเกมใหม่</h2>
        <p>สร้างห้องแล้วส่งลิงก์ให้เพื่อน คนแรกที่เข้ามาจะเป็นคู่แข่ง คนถัดไปเป็นผู้ชม</p>
        <fieldset className="time-controls">
          <legend>เวลาเล่นต่อฝั่ง</legend>
          {TIME_CONTROLS.map((tc) => (
            <label key={tc.value} className={tc.value === timeControl ? 'selected' : undefined}>
              <input
                type="radio"
                name="time-control"
                value={tc.value}
                checked={tc.value === timeControl}
                onChange={() => setTimeControl(tc.value)}
              />
              <span className="tc-label">{tc.label}</span>
              <span className="tc-hint">{tc.hint}</span>
            </label>
          ))}
        </fieldset>
        <button type="button" className="primary" onClick={onCreate} disabled={creating}>
          {creating ? 'กำลังสร้างห้อง…' : 'สร้างห้อง'}
        </button>
        {createError && (
          <p className="error" role="alert">
            สร้างห้องไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่
          </p>
        )}
      </section>

      <section className="card">
        <h2>เข้าห้องที่มีอยู่</h2>
        <form onSubmit={onJoin} className="join">
          <label htmlFor="room-code">รหัสห้องหรือลิงก์</label>
          <div className="row">
            <input
              id="room-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setCodeError(false)
              }}
              placeholder="เช่น abcdefghjkmn"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={codeError}
              aria-describedby={codeError ? 'room-code-error' : undefined}
            />
            <button type="submit">เข้าห้อง</button>
          </div>
          {codeError && (
            <p className="error" id="room-code-error" role="alert">
              รหัสห้องต้องเป็นตัวอักษร 12 ตัว ลองคัดลอกลิงก์มาวางทั้งหมด
            </p>
          )}
        </form>
      </section>

      <AccountPanel />
    </main>
  )
}

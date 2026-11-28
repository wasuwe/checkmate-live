import { useState } from 'react'
import { GameCard } from '../components/FableCard'
import { createRoom, CreateRoomError } from '../lib/api'
import { DEFAULT_TIME_CONTROL, TIME_CONTROLS } from '../lib/clock'
import { GAMES, isGameId, type GameType } from '../lib/games'
import { roomPath } from '../lib/router'

interface Props {
  navigate: (to: string) => void
}

/** หน้าเลือกเกม แล้วตั้งเวลาและสร้างห้องในป็อปอัป */
export function PlayPage({ navigate }: Props) {
  const [picked, setPicked] = useState<GameType | null>(null)
  const [timeControl, setTimeControl] = useState(DEFAULT_TIME_CONTROL)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onCreate() {
    setCreating(true)
    setError(null)
    try {
      navigate(roomPath(await createRoom(timeControl, isGameId(picked?.id) ? picked.id : 'chess')))
    } catch (err) {
      setError(err instanceof CreateRoomError ? err.message : 'สร้างห้องไม่ได้ เช็กเน็ตแล้วลองใหม่')
      setCreating(false)
    }
  }

  function close() {
    setPicked(null)
    setError(null)
  }

  return (
    <main className="screen medium play">
      <h1 className="title">เลือกเกมที่อยากเล่น</h1>
      <div className="game-grid">
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`game-card${picked?.id === g.id ? ' picked' : ''}`}
            disabled={g.soon}
            onClick={() => setPicked(g)}
          >
            <GameCard game={g.id} name={g.name} />
            <div className="game-desc pretty">{g.desc}</div>
            {g.soon && <div className="pill">เร็ว ๆ นี้</div>}
          </button>
        ))}
      </div>

      {picked && (
        <div className="overlay" onClick={close}>
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-game-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row">
              <h2 className="dialog-title grow" id="new-game-title">
                เล่น{picked.name}
              </h2>
              <button type="button" className="close" aria-label="ปิด" onClick={close}>
                ✕
              </button>
            </div>
            <p className="small pretty">
              สร้างห้องแล้วส่งลิงก์ให้เพื่อน คนแรกที่เข้ามาจะได้เล่นกับคุณ คนที่มาทีหลังเป็นผู้ชม
            </p>
            <div className="small" style={{ fontWeight: 600 }} id="tc-label">
              เวลาฝ่ายละ
            </div>
            <div className="tc-grid" role="group" aria-labelledby="tc-label">
              {TIME_CONTROLS.map((tc) => (
                <button
                  key={tc.value}
                  type="button"
                  className="tc"
                  aria-pressed={tc.value === timeControl}
                  onClick={() => setTimeControl(tc.value)}
                >
                  <b>{tc.label}</b>
                  <span>{tc.hint}</span>
                </button>
              ))}
            </div>
            {error && (
              <p className="error anim-shake" role="alert">
                {error}
              </p>
            )}
            <button type="button" className="btn pink strong" autoFocus disabled={creating} onClick={onCreate}>
              {creating ? 'กำลังสร้างห้อง…' : 'สร้างห้อง'}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

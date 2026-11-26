import { useEffect, useState } from 'react'
import { GameBoard } from '../components/GameBoard'
import { useGameSocket } from '../hooks/useGameSocket'
import type { StateMsg } from '../lib/protocol'
import { colorName, errorText, statusText } from '../lib/text'

interface Props {
  roomId: string
  navigate: (to: string) => void
}

export function RoomPage({ roomId, navigate }: Props) {
  const game = useGameSocket(roomId)
  const { state } = game

  if (game.fatal) {
    return (
      <main className="page">
        <h1>{game.fatal === 'room_not_found' ? 'ไม่พบห้องนี้' : 'เข้าห้องไม่ได้'}</h1>
        <p className="lead">
          {game.fatal === 'room_not_found'
            ? 'ห้องอาจถูกปิดไปแล้ว หรือรหัสห้องไม่ถูกต้อง'
            : 'ยืนยันตัวตนไม่สำเร็จ ลองโหลดหน้านี้ใหม่'}
        </p>
        <button type="button" className="primary" onClick={() => navigate('/')}>
          กลับหน้าแรก
        </button>
      </main>
    )
  }

  if (!state) {
    return (
      <main className="page">
        <p className="lead" role="status">
          {game.connection === 'reconnecting' ? 'เชื่อมต่อไม่ได้ กำลังลองใหม่…' : 'กำลังเข้าห้อง…'}
        </p>
      </main>
    )
  }

  return (
    <main className="page room">
      <header className="room-head">
        <button type="button" className="link" onClick={() => navigate('/')}>
          ← หน้าแรก
        </button>
        <span className="room-code">ห้อง {roomId}</span>
      </header>

      {game.connection !== 'open' && (
        <p className="banner" role="status">
          การเชื่อมต่อหลุด กำลังเชื่อมต่อใหม่…
        </p>
      )}

      <p className={`status status-${state.status}`} role="status">
        {statusText(state)}
      </p>
      <p className="seat">{seatText(state)}</p>

      {state.status === 'waiting' && <InvitePanel />}

      <GameBoard
        state={state}
        online={game.connection === 'open'}
        errorSeq={game.errorSeq}
        sendMove={game.sendMove}
      />

      <MoveErrorToast code={game.moveError} seq={game.errorSeq} />

      {state.status === 'finished' && (
        <button type="button" className="primary" onClick={() => navigate('/')}>
          เล่นเกมใหม่
        </button>
      )}
    </main>
  )
}

function seatText(state: StateMsg): string {
  if (state.you.role === 'spectator') return 'คุณกำลังดูเกมนี้ในฐานะผู้ชม'
  if (state.you.color === '') return 'สีจะถูกสุ่มเมื่อคู่แข่งเข้าห้อง'
  return `คุณเล่นฝ่าย${colorName(state.you.color)}`
}

/** ลิงก์เชิญเพื่อน แสดงระหว่างรอคู่แข่ง */
function InvitePanel() {
  const [copied, setCopied] = useState(false)
  const link = window.location.href

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false) // คัดลอกอัตโนมัติไม่ได้ ผู้ใช้ยังเลือกข้อความในช่องเองได้
    }
  }

  return (
    <section className="card invite">
      <label htmlFor="invite-link">ส่งลิงก์นี้ให้เพื่อนเพื่อเริ่มเกม</label>
      <div className="row">
        <input id="invite-link" value={link} readOnly onFocus={(e) => e.target.select()} />
        <button type="button" onClick={copy}>
          {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
        </button>
      </div>
    </section>
  )
}

/** แจ้งเมื่อเซิร์ฟเวอร์ปฏิเสธตาเดิน แล้วหายเองใน 3 วินาที */
function MoveErrorToast({ code, seq }: { code: string | null; seq: number }) {
  const [hiddenSeq, setHiddenSeq] = useState(0)

  useEffect(() => {
    if (seq === 0) return
    const timer = setTimeout(() => setHiddenSeq(seq), 3000)
    return () => clearTimeout(timer)
  }, [seq])

  if (code === null || seq <= hiddenSeq) return null
  return (
    <p className="toast" role="alert">
      {errorText(code)}
    </p>
  )
}

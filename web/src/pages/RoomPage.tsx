import { useEffect, useState } from 'react'
import { ChatPanel } from '../components/ChatPanel'
import { ClockRow } from '../components/ClockRow'
import { GameBoard } from '../components/GameBoard'
import { PiecePicker } from '../components/PiecePicker'
import { ResignButton } from '../components/ResignButton'
import { useGameSocket } from '../hooks/useGameSocket'
import { clockAt, describeTimeControl } from '../lib/clock'
import { absences } from '../lib/presence'
import type { Color, StateMsg } from '../lib/protocol'
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
      <p className="seat">
        {seatText(state)} · {describeTimeControl(state.tc)}
      </p>

      {state.status === 'waiting' && <InvitePanel />}
      <AbsenceNotice state={state} stateAt={game.stateAt} />

      <Clocks state={state} stateAt={game.stateAt}>
        <GameBoard
          state={state}
          online={game.connection === 'open'}
          errorSeq={game.errorSeq}
          sendMove={game.sendMove}
        />
      </Clocks>

      <MoveErrorToast code={game.moveError} seq={game.errorSeq} />

      {state.status === 'playing' && state.you.role === 'player' && (
        <ResignButton disabled={game.connection !== 'open'} onResign={game.sendResign} />
      )}

      {state.status === 'finished' && (
        <button type="button" className="primary" onClick={() => navigate('/')}>
          เล่นเกมใหม่
        </button>
      )}

      <ChatPanel
        messages={game.chat}
        online={game.connection === 'open'}
        rateLimitedSeq={game.chatLimitedSeq}
        sendChat={game.sendChat}
      />

      <details className="card display-options">
        <summary>การแสดงผล</summary>
        <PiecePicker />
      </details>
    </main>
  )
}

function seatText(state: StateMsg): string {
  if (state.you.role === 'spectator') return 'คุณกำลังดูเกมนี้ในฐานะผู้ชม'
  if (state.you.color === '') return 'สีจะถูกสุ่มเมื่อคู่แข่งเข้าห้อง'
  return `คุณเล่นฝ่าย${colorName(state.you.color)}`
}

/** นาฬิกาสองฝั่งครอบกระดาน: ฝั่งตรงข้ามอยู่บน ฝั่งของผู้ดูอยู่ล่าง (ตรงกับการหมุนกระดาน) */
function Clocks({
  state,
  stateAt,
  children,
}: {
  state: StateMsg
  stateAt: number
  children: React.ReactNode
}) {
  const [now, setNow] = useState(() => Date.now())
  const running = state.clock.running

  useEffect(() => {
    if (running === '') return
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [running])

  const left = clockAt(state, stateAt, Math.max(now, stateAt))
  const bottom: Color = state.you.color === 'b' ? 'b' : 'w'
  const top: Color = bottom === 'w' ? 'b' : 'w'
  const label = (color: Color) =>
    state.you.color === color ? `คุณ (${colorName(color)})` : colorName(color)

  return (
    <div className="board-area">
      <ClockRow label={label(top)} ms={left[top]} running={running === top} />
      {children}
      <ClockRow label={label(bottom)} ms={left[bottom]} running={running === bottom} />
    </div>
  )
}

/** แจ้งเมื่อมีผู้เล่นหลุดจากเกม พร้อมเวลานับถอยหลังก่อนถูกปรับแพ้ */
function AbsenceNotice({ state, stateAt }: { state: StateMsg; stateAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  const anyoneAway =
    state.status === 'playing' && Object.values(state.players ?? {}).some((p) => !p.connected)

  useEffect(() => {
    if (!anyoneAway) return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [anyoneAway])

  // state ใหม่อาจมาถึงก่อน interval รอบถัดไป จึงใช้เวลาที่มากกว่าเสมอ
  const away = absences(state, stateAt, Math.max(now, stateAt))
  if (away.length === 0) return null

  return (
    <div className="banner" role="status">
      {away.map(({ color, secondsLeft }) => {
        const who = state.you.color === '' ? `ฝ่าย${colorName(color)}` : 'คู่แข่ง'
        return (
          <p key={color}>
            {who}หลุดจากเกม ถ้าไม่กลับมาใน {secondsLeft} วินาทีจะถูกปรับแพ้
          </p>
        )
      })}
    </div>
  )
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

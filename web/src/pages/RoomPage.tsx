import { useEffect, useState } from 'react'
import { ChatPanel } from '../components/ChatPanel'
import { ClockRow } from '../components/ClockRow'
import { GameBoard } from '../components/GameBoard'
import { PiecePicker } from '../components/PiecePicker'
import { ResignButton } from '../components/ResignButton'
import { useGameSocket } from '../hooks/useGameSocket'
import { clockAt, describeTimeControl } from '../lib/clock'
import { gameName, gameOf } from '../lib/games'
import { VS } from '../lib/pieceSets'
import { absences } from '../lib/presence'
import type { Color, StateMsg } from '../lib/protocol'
import {
  colorName,
  countText,
  errorText,
  forcedText,
  formatRoomCode,
  playerName,
  resultParts,
  statusText,
} from '../lib/text'

interface Props {
  roomId: string
  navigate: (to: string) => void
}

export function RoomPage({ roomId, navigate }: Props) {
  const game = useGameSocket(roomId)
  const { state } = game

  if (game.fatal) {
    return (
      <main className="screen">
        <h1 className="title">{game.fatal === 'room_not_found' ? 'ไม่พบห้องนี้' : 'เข้าห้องไม่ได้'}</h1>
        <p className="pretty">{FATAL_TEXT[game.fatal]}</p>
        <button type="button" className="btn pink" onClick={() => navigate('/')}>
          กลับหน้าแรก
        </button>
      </main>
    )
  }

  if (!state) {
    return (
      <main className="screen">
        <p className="card center" role="status">
          {game.connection === 'reconnecting' ? 'เชื่อมต่อไม่ได้ กำลังลองใหม่…' : 'กำลังเข้าห้อง…'}
        </p>
      </main>
    )
  }

  const online = game.connection === 'open'
  const gameId = gameOf(state)
  const counting = countText(state) || forcedText(state)
  return (
    <main className="screen wide room">
      {!online && (
        <p className="banner" role="status">
          การเชื่อมต่อหลุด กำลังเชื่อมต่อใหม่…
        </p>
      )}

      <div className="game">
        <div className="game-col">
          <p className={`status status-${state.status}`} role="status">
            {statusText(state)}
          </p>
          <p className="seat">
            {seatText(state)} · {describeTimeControl(state.tc)}
          </p>
          {counting && (
            <p className="count-chip" role="status">
              {counting}
            </p>
          )}
          <AbsenceNotice state={state} stateAt={game.stateAt} />
          <Clocks state={state} stateAt={game.stateAt}>
            <GameBoard state={state} online={online} errorSeq={game.errorSeq} sendMove={game.sendMove} />
          </Clocks>
        </div>

        <div className="game-col side">
          {state.status === 'waiting' && <WaitingCard roomId={roomId} />}

          <section className="card side" aria-label="ห้องนี้">
            <div className="row">
              <div className="grow">
                <div className="tiny">{gameName(gameId)} · รหัสห้อง</div>
                <div className="room-code">{formatRoomCode(roomId)}</div>
              </div>
              {/* เปิดแท็บใหม่ เพื่อไม่ให้ออกจากห้องกลางเกม */}
              <a className="btn mini" href={`/rules?game=${gameId}`} target="_blank" rel="noopener">
                กฎ
              </a>
            </div>
            <div className="row wrap">
              <CopyLinkButton />
              {state.status === 'playing' && state.you.role === 'player' && (
                <ResignButton disabled={!online} onResign={game.sendResign} />
              )}
              {state.status === 'finished' && (
                <button type="button" className="btn mini pink" onClick={() => navigate('/play')}>
                  เล่นเกมใหม่
                </button>
              )}
            </div>
          </section>

          <section className="card side" aria-label="ชุดหมากรุก">
            <div className="row">
              <h2 className="card-title grow">เลือกชุดหมากรุก</h2>
              <a className="small" href="/profile" target="_blank" rel="noopener">
                จัดการชุด
              </a>
            </div>
            <PiecePicker />
          </section>

          <ChatPanel
            messages={game.chat}
            players={state.players}
            online={online}
            rateLimitedSeq={game.chatLimitedSeq}
            sendChat={game.sendChat}
            reported={game.reported}
            sendReport={game.sendReport}
          />
        </div>
      </div>

      <MoveErrorToast code={game.moveError} seq={game.errorSeq} />
      {state.status === 'finished' && <GameOverDialog state={state} navigate={navigate} />}
    </main>
  )
}

const FATAL_TEXT: Record<NonNullable<ReturnType<typeof useGameSocket>['fatal']>, string> = {
  room_not_found: 'ห้องอาจถูกปิดไปแล้ว หรือรหัสห้องไม่ถูกต้อง',
  unauthorized: 'ยืนยันตัวตนไม่สำเร็จ ลองโหลดหน้านี้ใหม่',
  too_many_connections: 'คุณเปิดเกมไว้หลายแท็บเกินไป ปิดแท็บอื่นแล้วโหลดหน้านี้ใหม่',
}

function seatText(state: StateMsg): string {
  if (state.you.role === 'spectator') return 'คุณกำลังดูเกมนี้ในฐานะผู้ชม'
  if (state.you.color === '') return 'สีจะถูกสุ่มเมื่อคู่แข่งเข้าห้อง'
  return `คุณเล่นฝ่าย${colorName(state.you.color)}`
}

/** แถบผู้เล่นสองฝั่งครอบกระดาน: ฝั่งตรงข้ามอยู่บน ฝั่งของผู้ดูอยู่ล่าง (ตรงกับการหมุนกระดาน) */
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
  const row = (color: Color) => {
    const info = state.players?.[color]
    const mine = state.you.color === color
    return (
      <ClockRow
        label={info ? playerName(info, color) + (mine ? ' (คุณ)' : '') : mine ? 'คุณ' : `ฝั่ง${colorName(color)}`}
        detail={info || mine ? `ฝั่ง${colorName(color)}` : 'ยังไม่มีผู้เล่น'}
        avatar={info ? (info.avatar ?? '') : undefined}
        ms={left[color]}
        running={running === color}
      />
    )
  }

  return (
    <>
      {row(top)}
      {children}
      {row(bottom)}
    </>
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

function CopyLinkButton({ big = false }: { big?: boolean }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
    } catch {
      setCopied(false) // คัดลอกอัตโนมัติไม่ได้ ผู้ใช้ยังคัดลอกจากแถบที่อยู่ได้
    }
  }

  return (
    <button type="button" className={big ? 'btn butter' : 'btn mini butter'} onClick={copy}>
      {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}
    </button>
  )
}

/** การ์ดระหว่างรอคู่แข่ง: รหัสห้องตัวใหญ่และปุ่มส่งลิงก์ให้เพื่อน */
function WaitingCard({ roomId }: { roomId: string }) {
  const canShare = typeof navigator.share === 'function'
  return (
    <section className="card side waiting" aria-label="เชิญเพื่อน">
      <h2 className="card-title">รอเพื่อนเข้าห้อง</h2>
      <p className="small pretty">ส่งลิงก์หรือรหัสนี้ให้เพื่อน เกมเริ่มทันทีเมื่อเพื่อนเข้ามา</p>
      <div className="room-code huge">{formatRoomCode(roomId)}</div>
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <CopyLinkButton big />
        {canShare && (
          <button
            type="button"
            className="btn mint"
            onClick={() => {
              // ผู้ใช้ปิดหน้าต่างแชร์เองไม่ใช่ข้อผิดพลาด
              navigator.share({ title: 'CheckMate Live', url: window.location.href }).catch(() => {})
            }}
          >
            แชร์
          </button>
        )}
      </div>
    </section>
  )
}

/** ป็อปอัปผลเกม ปิดเพื่อดูกระดานต่อได้ */
function GameOverDialog({ state, navigate }: { state: StateMsg; navigate: (to: string) => void }) {
  const [open, setOpen] = useState(true)
  // รอให้เอฟเฟกต์จบเกมบนกระดาน (เช่น รุกฆาต) เล่นก่อน แล้วค่อยขึ้นป็อปอัป
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), RESULT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])
  if (!open || !ready) return null
  const { headline, reason, outcome } = resultParts(state)
  const medal = MEDALS[outcome]

  return (
    <div className="overlay" onClick={() => setOpen(false)}>
      <div
        className="dialog narrow"
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="medal result-medal" style={{ background: medal.bg }} aria-hidden="true">
          {medal.glyph + VS}
        </div>
        <h2 className="title" id="result-title">
          {headline}
        </h2>
        {reason && <p>{reason}</p>}
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn pink strong" autoFocus onClick={() => navigate('/play')}>
            เล่นอีกครั้ง
          </button>
          <button type="button" className="btn" onClick={() => navigate('/')}>
            กลับหน้าแรก
          </button>
        </div>
        <button type="button" className="link small" onClick={() => setOpen(false)}>
          ดูกระดาน
        </button>
      </div>
    </div>
  )
}

const RESULT_DELAY_MS = 1500

const MEDALS: Record<'win' | 'loss' | 'draw' | 'watch', { glyph: string; bg: string }> = {
  win: { glyph: '♚', bg: 'var(--butter)' },
  loss: { glyph: '♟', bg: 'var(--lavender)' },
  draw: { glyph: '♜', bg: 'var(--mint)' },
  watch: { glyph: '♛', bg: 'var(--sky)' },
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

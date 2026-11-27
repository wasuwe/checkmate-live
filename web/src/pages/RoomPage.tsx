import { useCallback, useEffect, useRef, useState } from 'react'
import { ChatPanel } from '../components/ChatPanel'
import { Emblem } from '../components/Emblem'
import { ClockRow } from '../components/ClockRow'
import { CoinToss } from '../components/CoinToss'
import { Lobby } from '../components/Lobby'
import { GameBoard } from '../components/GameBoard'
import { PiecePicker } from '../components/PiecePicker'
import { ResignButton } from '../components/ResignButton'
import { useChatPopup, type ChatPopup } from '../hooks/useChatPopup'
import { useGameSocket } from '../hooks/useGameSocket'
import { clockAt, describeTimeControl } from '../lib/clock'
import { gameName, gameOf } from '../lib/games'
import { chatNames } from '../lib/lobby'
import { VS } from '../lib/pieceSets'
import { absences } from '../lib/presence'
import type { ChatItem, Color, StateMsg } from '../lib/protocol'
import { capturedSquares } from '../lib/fx'
import { playMoveSound } from '../lib/sound'
import { becameMyTurn, setTurnSound, turnSoundOn, useTurnSound } from '../lib/turnAlert'
import { shouldToss, tossView, type TossView } from '../lib/toss'
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
  const [toss, dismissToss] = useCoinToss(state)
  // ระหว่างเกมแชทปิดไว้ เปิดด้วยการกดรูปฝ่ายตรงข้าม ข้อความใหม่เด้งขึ้นข้างรูป
  const inGame = !!state && !(state.status === 'waiting' && state.lobby)
  const pop = useChatPopup(game.chat, inGame)
  const [turnSeq, turnToast] = useTurnAlert(state)

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
  const chat = (
    <ChatPanel
      messages={game.chat}
      players={state.players}
      names={chatNames(state)}
      tall
      mutedState={[pop.muted, pop.setMuted]}
      online={online}
      rateLimitedSeq={game.chatLimitedSeq}
      sendChat={game.sendChat}
      reported={game.reported}
      sendReport={game.sendReport}
    />
  )

  // ก่อนเกมเริ่ม: ห้องรอ (รอคน แชท กดพร้อม)
  if (state.status === 'waiting' && state.lobby) {
    return <Lobby state={state} lobby={state.lobby} stateAt={game.stateAt} online={online} sendReady={game.sendReady} chat={chat} />
  }

  // ระหว่างเกมและหลังจบ: กระดานใหญ่เต็มพื้นที่ ห้องยุบเป็นแถบด้านบน แชทอยู่ด้านล่าง
  return (
    <main className="screen full room">
      {!online && (
        <p className="banner" role="status">
          การเชื่อมต่อหลุด กำลังเชื่อมต่อใหม่…
        </p>
      )}

      {/* คอลัมน์เดียว: แถบห้อง (ยุบไว้) อยู่บนสุด กระดานอยู่กลางและได้พื้นที่มากที่สุด แชทอยู่ล่างสุด */}
      <div className="game stack">
        <div className="game-col board-col">
          <div className="room-bar">
            <details className="room-details">
              <summary aria-label={`ห้อง ${formatRoomCode(roomId)} กดเพื่อเชิญเพื่อนหรือเปลี่ยนชุดหมากรุก`}>
                <span className="tiny">ห้อง</span>
                <b className="room-code">{formatRoomCode(roomId)}</b>
                <span className="room-caret" aria-hidden="true" />
              </summary>
              <div className="room-pop">
                <div className="tiny">{gameName(gameId)} · เชิญเพื่อนด้วยลิงก์หรือรหัสห้อง</div>
                <div className="row wrap">
                  <CopyLinkButton />
                  {/* เปิดแท็บใหม่ เพื่อไม่ให้ออกจากห้องกลางเกม */}
                  <a className="btn mini" href={`/rules?game=${gameId}`} target="_blank" rel="noopener">
                    กฎ
                  </a>
                  <button type="button" className="btn mini" onClick={() => navigate('/')}>
                    ออกไปหน้าแรก
                  </button>
                </div>
                <TurnSoundToggle />
                <div className="set-details">
                  <b className="small">ชุดหมากรุก</b>
                  <PiecePicker />
                  <a className="small" href="/profile" target="_blank" rel="noopener">
                    จัดการชุด
                  </a>
                </div>
              </div>
            </details>

            <div className="game-status">
              <p className={`status status-${state.status}`} role="status">
                {statusText(state)}
              </p>
              <p className="seat">
                {seatText(state)} · {describeTimeControl(state.tc)}
              </p>
            </div>

            {state.status === 'playing' && state.you.role === 'player' && (
              <ResignButton disabled={!online} onResign={game.sendResign} />
            )}
            {state.status === 'finished' && (
              <button type="button" className="btn mini pink" onClick={() => navigate('/play')}>
                เล่นเกมใหม่
              </button>
            )}
          </div>

          {state.status === 'waiting' && <WaitingCard roomId={roomId} />}
          {counting && (
            <p className="count-chip" role="status">
              {counting}
            </p>
          )}
          <AbsenceNotice state={state} stateAt={game.stateAt} />
          <Clocks state={state} stateAt={game.stateAt} pop={pop} names={chatNames(state)} turnSeq={turnSeq}>
            <ChatPopover pop={pop}>{chat}</ChatPopover>
            {turnToast && (
              <div key={turnSeq} className="turn-toast" role="status">
                ถึงตาคุณแล้ว!
              </div>
            )}
            <GameBoard state={state} online={online} errorSeq={game.errorSeq} session={game.session} sendMove={game.sendMove} />
          </Clocks>
        </div>
      </div>

      {toss && <CoinToss view={toss} onDone={dismissToss} />}
      <MoveErrorToast code={game.moveError} seq={game.errorSeq} />
      {state.status === 'finished' && <GameOverDialog state={state} navigate={navigate} />}
    </main>
  )
}

/**
 * ภาพโยนเหรียญตอนเริ่มเกม เล่นครั้งเดียวต่อห้อง เมื่อได้ state แรกของเกมที่นาฬิกายังรอเริ่มอยู่
 * คืนสิ่งที่ต้องแสดง (หรือ null) และฟังก์ชันปิด
 */
function useCoinToss(state: StateMsg | null): [TossView | null, () => void] {
  const [toss, setToss] = useState<{ view: TossView; done: boolean } | null>(null)

  // ตั้งค่าระหว่าง render (ไม่ใช้ effect): เกิดครั้งเดียวเพราะหลังจากนี้ toss ไม่เป็น null อีก
  if (toss === null && state && shouldToss(state)) setToss({ view: tossView(state), done: false })

  const dismiss = useCallback(() => setToss((t) => (t ? { ...t, done: true } : t)), [])
  return [toss && !toss.done ? toss.view : null, dismiss]
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
  pop,
  names,
  turnSeq,
  children,
}: {
  state: StateMsg
  stateAt: number
  pop: ChatPopup
  names: Record<string, string>
  /** เพิ่มทุกครั้งที่ถึงตาผู้ดู (0 = ยังไม่เคย) ใช้เล่นการกะพริบของแถบตัวเอง */
  turnSeq: number
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
    const alert = mine && turnSeq > 0 && running === color
    return (
      <ClockRow
        key={alert ? `${color}-${turnSeq}` : color}
        alert={alert}
        label={info ? playerName(info, color) + (mine ? ' (คุณ)' : '') : mine ? 'คุณ' : `ฝั่ง${colorName(color)}`}
        detail={info || mine ? `ฝั่ง${colorName(color)}` : 'ยังไม่มีผู้เล่น'}
        avatar={info ? (info.avatar ?? '') : undefined}
        ms={left[color]}
        running={running === color}
        chat={
          color === top
            ? {
                onOpen: () => pop.setOpen(!pop.open),
                open: pop.open,
                unread: pop.unread,
                bubble: pop.bubble ? { who: bubbleName(pop.bubble, state, names), text: pop.bubble.text } : undefined,
              }
            : undefined
        }
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

/** ชื่อผู้ส่งของข้อความที่เด้งขึ้น */
function bubbleName(item: ChatItem, state: StateMsg, names: Record<string, string>): string {
  const known = names[item.sender]
  if (known) return known
  if (item.from === '') return 'ผู้ชม'
  const info = state.players?.[item.from]
  return info ? playerName(info, item.from) : colorName(item.from)
}

/**
 * แชทระหว่างเกม: ลอยทับกระดานใต้แถบของฝ่ายตรงข้าม เปิดด้วยการกดรูปของฝ่ายตรงข้าม
 * แผงแชทอยู่ในหน้าตลอด (แค่ซ่อน) ข้อความที่พิมพ์ค้างไว้จึงไม่หายเมื่อปิด
 */
function ChatPopover({ pop, children }: { pop: ChatPopup; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const { open, setOpen } = pop

  useEffect(() => {
    if (!open) return
    const box = ref.current
    const list = box?.querySelector('.chat-list')
    if (list) list.scrollTop = list.scrollHeight
    box?.querySelector('input')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  return (
    <div className="chat-anchor">
      <div className="chat-pop" ref={ref} hidden={!open} role="dialog" aria-label="แชท">
        <button type="button" className="close chat-close" aria-label="ปิดแชท" onClick={() => setOpen(false)}>
          ✕
        </button>
        {children}
      </div>
    </div>
  )
}

/**
 * เสียงวางหมากทุกตาเดิน (ถ้าเปิดไว้) และเตือนเมื่อถึงตาผู้เล่น: สั่นบนมือถือ และชื่อแท็บเปลี่ยนเมื่ออยู่หน้าต่างอื่น
 * คืนเลขที่เพิ่มทุกครั้งที่ถึงตา (ให้แถบผู้เล่นกะพริบ) และว่าป้ายบนกระดานยังแสดงอยู่หรือไม่ (หายเองหลังเล่นจบ)
 */
function useTurnAlert(state: StateMsg | null): [number, boolean] {
  const prev = useRef<StateMsg | null>(null)
  const [seq, setSeq] = useState(0)
  const [toastSeq, setToastSeq] = useState(0)

  useEffect(() => {
    const before = prev.current
    prev.current = state
    // เสียงวางหมากทุกตาเดิน (ทั้งของเราและของคู่แข่ง หมากฮอสที่กินต่อดังทุกต่อ) ตาที่กินมีเสียงหนักกว่า
    // ไม่ดังตอนเข้าห้องหรือเชื่อมต่อใหม่ที่ข้ามไปหลายตา
    if (state && before && state.ply === before.ply + 1 && turnSoundOn()) {
      playMoveSound(capturedSquares(before, state).length > 0 ? 'capture' : 'move')
    }
    if (!state || !becameMyTurn(before, state)) return
    const next = seq + 1
    setSeq(next)
    setToastSeq(next)
    navigator.vibrate?.(80)
    const timer = setTimeout(() => setToastSeq((t) => (t === next ? 0 : t)), TOAST_MS)
    return () => clearTimeout(timer)
    // seq อ่านค่าปัจจุบันเพื่อสร้างเลขถัดไปเท่านั้น ไม่ใช่เหตุให้ต้องเตือนใหม่
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // ชื่อแท็บ: เห็นได้แม้ผู้เล่นสลับไปหน้าต่างอื่น (เช่น ระหว่างคุยใน Discord)
  const myTurn = !!state && state.status === 'playing' && state.you.color !== '' && state.turn === state.you.color
  useEffect(() => {
    const base = 'CheckMate Live'
    const apply = () => {
      document.title = myTurn && document.hidden ? '● ถึงตาคุณแล้ว! · ' + base : base
    }
    apply()
    document.addEventListener('visibilitychange', apply)
    return () => {
      document.removeEventListener('visibilitychange', apply)
      document.title = base
    }
  }, [myTurn])

  return [seq, toastSeq !== 0 && toastSeq === seq]
}

/** ป้าย "ถึงตาคุณแล้ว!" แสดงนานเท่ากับการเคลื่อนไหวของมัน (turnToast ใน index.css) */
const TOAST_MS = 1800

/** ปุ่มเปิด/ปิดเสียงวางหมาก */
function TurnSoundToggle() {
  const on = useTurnSound()
  return (
    <button
      type="button"
      className={`btn mini${on ? ' mint' : ''}`}
      aria-pressed={on}
      onClick={() => {
        setTurnSound(!on)
        if (!on) playMoveSound('move') // ให้ได้ยินตัวอย่างตอนเปิด
      }}
    >
      {on ? 'เสียงหมาก: เปิด' : 'เสียงหมาก: ปิด'}
    </button>
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
        <Emblem width={170} className="gold" />
        <div className="medal result-medal" style={{ background: medal.bg }} aria-hidden="true">
          {medal.glyph + VS}
        </div>
        <h2 className="title starred" id="result-title">
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

const RESULT_DELAY_MS = 4200

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

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { describeTimeControl } from '../lib/clock'
import { gameName, gameOf } from '../lib/games'
import { countdownSeconds, lobbyHint, mySeat, SEAT_STATUS_TEXT, seatName, seatStatus } from '../lib/lobby'
import type { LobbyInfo, LobbySeat, StateMsg } from '../lib/protocol'
import { formatRoomCode } from '../lib/text'
import { Avatar } from './Avatar'
import { PiecePicker } from './PiecePicker'

interface Props {
  state: StateMsg
  lobby: LobbyInfo
  /** เวลาที่ได้รับ state นี้ ใช้นับถอยหลังต่อในหน้าเว็บ */
  stateAt: number
  online: boolean
  sendReady: (ready: boolean) => boolean
  /** เชิญผู้เล่นอีกคนออกจากที่นั่ง (ใช้ได้เฉพาะเจ้าของห้อง เซิร์ฟเวอร์ตรวจอีกชั้น) */
  sendKick: () => boolean
  /** แผงแชทของห้อง (ใช้ตัวเดียวกับระหว่างเกม) */
  chat: ReactNode
}

/**
 * ห้องรอก่อนเกม: รหัสห้อง ที่นั่งของผู้เล่นสองคน ปุ่มพร้อม และแชท
 * เกมเริ่มเมื่อผู้เล่นทั้งสองกดพร้อมและนับถอยหลังครบ (เซิร์ฟเวอร์เป็นผู้นับ)
 */
export function Lobby({ state, lobby, stateAt, online, sendReady, sendKick, chat }: Props) {
  const me = mySeat(lobby)
  const seconds = useCountdown(lobby, stateAt)
  const gameId = gameOf(state)
  // เชิญออกได้เฉพาะที่นั่งของอีกคน และเฉพาะก่อนเริ่มนับถอยหลัง (ระหว่างนับปุ่มหายไป กันกดพลาดตอนเกมกำลังเริ่ม)
  const kick = lobby.canKick && online && seconds === null ? sendKick : undefined

  return (
    <main className="screen wide lobby">
      {!online && (
        <p className="banner" role="status">
          การเชื่อมต่อหลุด กำลังเชื่อมต่อใหม่…
        </p>
      )}

      <div className="row wrap lobby-head">
        <h1 className="title grow">ห้องรอ · {gameName(gameId)}</h1>
        <span className="pill">{describeTimeControl(state.tc)}</span>
        {/* เปิดแท็บใหม่ เพื่อไม่ให้ออกจากห้อง */}
        <a className="btn mini" href={`/rules?game=${gameId}`} target="_blank" rel="noopener">
          กฎ
        </a>
      </div>

      {/* สี่ส่วนเป็นลูกของตารางโดยตรง CSS จึงจัดตำแหน่งตามขนาดจอได้: จอกว้างสองคอลัมน์ จอแคบเรียงลงมา */}
      <div className="lobby-grid">
        <section className="card side lobby-invite" aria-label="เชิญเพื่อน">
          <div className="lobby-code">
            <div className="tiny">รหัสห้อง</div>
            <div className="room-code huge">{formatRoomCode(state.room)}</div>
          </div>
          <div className="row wrap lobby-share">
            <CopyLinkButton />
            <ShareButton />
          </div>
        </section>

        <section className="card side lobby-players" aria-label="ผู้เล่น">
          <div className="lobby-seats">
            <SeatCard seat={lobby.seats[0]} onKick={kick} />
            <span className="lobby-vs" aria-hidden="true">
              VS
            </span>
            <SeatCard seat={lobby.seats[1]} onKick={kick} />
          </div>

          {seconds !== null ? (
            <div className="lobby-countdown" role="status" aria-live="assertive">
              <span>เริ่มใน</span>
              {/* key ทำให้ตัวเลขเด้งทุกครั้งที่เปลี่ยน */}
              <b key={seconds}>{seconds}</b>
            </div>
          ) : (
            <p className="lobby-hint pretty" role="status">
              {lobbyHint(lobby)}
            </p>
          )}

          {me && (
            <button
              type="button"
              className={`btn big block${me.ready ? '' : ' pink strong'}`}
              aria-pressed={me.ready}
              disabled={!online}
              onClick={() => sendReady(!me.ready)}
            >
              {me.ready ? 'ยกเลิกพร้อม' : 'พร้อม!'}
            </button>
          )}
        </section>

        <section className="card side lobby-sets" aria-label="ชุดหมากรุก">
          <div className="row lobby-sets-head">
            <h2 className="card-title grow">เลือกชุดหมากรุกระหว่างรอ</h2>
            <a className="small" href="/profile" target="_blank" rel="noopener">
              จัดการชุด
            </a>
          </div>
          <PiecePicker />
        </section>

        <div className="lobby-chat">{chat}</div>
      </div>
    </main>
  )
}

function SeatCard({ seat, onKick }: { seat: LobbySeat | undefined; onKick?: () => void }) {
  const status = seatStatus(seat)
  const [confirming, setConfirming] = useState(false)
  // ปุ่มเชิญออกอยู่บนที่นั่งของอีกคนเท่านั้น
  const canKick = !!seat && !seat.you && !!onKick
  return (
    <div className={`lobby-seat ${status}`}>
      {seat ? <Avatar avatar={seat.avatar ?? ''} size={56} /> : <span className="lobby-seat-empty" aria-hidden="true" />}
      <b className="lobby-seat-name">{seat ? seatName(seat) : 'ที่นั่งว่าง'}</b>
      {seat?.host && <span className="lobby-seat-host">เจ้าของห้อง</span>}
      <span className="pill lobby-seat-status">
        {status === 'ready' && <span aria-hidden="true">✓ </span>}
        {SEAT_STATUS_TEXT[status]}
      </span>
      {canKick && (
        <button type="button" className="lobby-kick" onClick={() => setConfirming(true)}>
          เชิญออก
        </button>
      )}
      {/* วางที่ body: หน้าห้องรอมีการเคลื่อนไหวตอนเปิด ซึ่งทำให้กล่องที่อยู่ข้างในไม่คลุมเต็มจอ */}
      {canKick &&
        confirming &&
        createPortal(
          <div className="overlay" onClick={() => setConfirming(false)}>
            <div
              className="dialog narrow"
              role="dialog"
              aria-modal="true"
              aria-labelledby="kick-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="dialog-title" id="kick-title">
                เชิญ {seat.name || 'ผู้เล่นคนนี้'} ออกจากที่นั่ง?
              </h2>
              <p>ที่นั่งจะว่างให้คนอื่นเข้ามาแทน คนที่ถูกเชิญออกยังดูเกมได้ แต่กลับมานั่งในห้องนี้ไม่ได้</p>
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn mint" autoFocus onClick={() => setConfirming(false)}>
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    setConfirming(false)
                    onKick()
                  }}
                >
                  เชิญออก
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

/** วินาทีที่เหลือก่อนเกมเริ่ม อัปเดตเองระหว่างนับ หรือ null ถ้ายังไม่นับ */
function useCountdown(lobby: LobbyInfo, stateAt: number): number | null {
  const [now, setNow] = useState(() => Date.now())
  const counting = !!lobby.countdown
  useEffect(() => {
    if (!counting) return
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [counting])
  return countdownSeconds(lobby, stateAt, Math.max(now, stateAt))
}

function CopyLinkButton() {
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
    <button type="button" className="btn butter" onClick={copy}>
      {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}
    </button>
  )
}

function ShareButton() {
  if (typeof navigator.share !== 'function') return null
  return (
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
  )
}

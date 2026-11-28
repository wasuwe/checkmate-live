import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { describeTimeControl } from '../lib/clock'
import { gameName, gameOf } from '../lib/games'
import { countdownSeconds, lobbyHint, mySeat, SEAT_STATUS_TEXT, seatName, seatStatus } from '../lib/lobby'
import type { LobbyInfo, LobbySeat, StateMsg } from '../lib/protocol'
import { formatRoomCode } from '../lib/text'
import { Avatar } from './Avatar'
import { heroSvg, SETS, useSetPrefs, type BoardSet } from '../lib/pieceSets'
import { PiecePicker } from './PiecePicker'
import { Stands } from './Stands'

interface Props {
  state: StateMsg
  lobby: LobbyInfo
  /** เวลาที่ได้รับ state นี้ ใช้นับถอยหลังต่อในหน้าเว็บ */
  stateAt: number
  online: boolean
  sendReady: (ready: boolean) => boolean
  /** เชิญผู้เล่นอีกคนออกจากที่นั่ง (ใช้ได้เฉพาะเจ้าของห้อง เซิร์ฟเวอร์ตรวจอีกชั้น) */
  sendKick: () => boolean
  /** บอกเซิร์ฟเวอร์ว่าเลือกชุดหมากรุกไหน (ครึ่งกระดานของเราในเกมใช้ชุดนี้ ทุกคนในห้องเห็น) */
  sendSet: (set: string) => boolean
  /** แผงแชทของห้อง (ใช้ตัวเดียวกับระหว่างเกม) */
  chat: ReactNode
}

/**
 * ห้องรอก่อนเกม: รหัสห้อง ที่นั่งของผู้เล่นสองคน ปุ่มพร้อม และแชท
 * เกมเริ่มเมื่อผู้เล่นทั้งสองกดพร้อมและนับถอยหลังครบ (เซิร์ฟเวอร์เป็นผู้นับ)
 */
export function Lobby({ state, lobby, stateAt, online, sendReady, sendKick, sendSet, chat }: Props) {
  const me = mySeat(lobby)
  // ชุดที่เลือกถูกส่งให้เซิร์ฟเวอร์ทุกครั้งที่เปลี่ยน และส่งใหม่เมื่อได้ที่นั่งหรือเชื่อมต่อกลับมา
  // เลือกได้เฉพาะในห้องรอ เมื่อเกมเริ่มแล้วชุดของทั้งสองฝั่งคงที่จนจบเกม
  const { set } = useSetPrefs()
  const seated = !!me
  useEffect(() => {
    if (seated && online) sendSet(set.id)
    // sendSet เป็นฟังก์ชันใหม่ทุกครั้งที่วาด แต่ส่งผ่านการเชื่อมต่อเดิม จึงไม่ใช่เหตุให้ส่งซ้ำ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seated, online, set.id])
  const seconds = useCountdown(lobby, stateAt)
  const gameId = gameOf(state)
  // เชิญออกได้เฉพาะที่นั่งของอีกคน และเฉพาะก่อนเริ่มนับถอยหลัง (ระหว่างนับปุ่มหายไป กันกดพลาดตอนเกมกำลังเริ่ม)
  const kick = lobby.canKick && online && seconds === null ? sendKick : undefined

  return (
    <main className="screen wide lobby">
      {!online && (
        <p className="banner" role="status">
          หลุดจากห้อง กำลังต่อกลับเข้าไป…
        </p>
      )}

      <div className="row wrap lobby-head">
        <h1 className="title grow">ห้อง{gameName(gameId)}</h1>
        <span className="pill">{describeTimeControl(state.tc)}</span>
        {/* เปิดแท็บใหม่ เพื่อไม่ให้ออกจากห้อง */}
        <a className="btn mini" href={`/rules?game=${gameId}`} target="_blank" rel="noopener">
          กติกา
        </a>
      </div>

      {/* สี่ส่วนเป็นลูกของตารางโดยตรง CSS จึงจัดตำแหน่งตามขนาดจอได้: จอกว้างสองคอลัมน์ จอแคบเรียงลงมา */}
      <div className="lobby-grid">
        <section className="card side lobby-invite" aria-label="ชวนเพื่อน">
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
              <span>เกมเริ่มในอีก</span>
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
              {me.ready ? 'ขอเวลาอีกนิด' : 'พร้อม!'}
            </button>
          )}
          <Stands spectators={state.spectators} watching={state.watching} />
        </section>

        <section className="card side lobby-sets" aria-label="ชุดหมากรุก">
          <div className="row lobby-sets-head">
            <h2 className="card-title grow">เลือกชุดหมากรุก</h2>
            <a className="small" href="/profile" target="_blank" rel="noopener">
              ดูชุดทั้งหมด
            </a>
          </div>
          <PiecePicker />
          <p className="tiny pretty lobby-sets-note">ชุดนี้ใช้กับตัวหมากและกระดานครึ่งฝั่งคุณ เปลี่ยนได้จนกว่าเกมจะเริ่ม</p>
        </section>

        <div className="lobby-chat">{chat}</div>
      </div>
    </main>
  )
}

function SeatCard({ seat, onKick }: { seat: LobbySeat | undefined; onKick?: () => void }) {
  const status = seatStatus(seat)
  const [confirming, setConfirming] = useState(false)
  // ชุดของที่นั่งนี้: ชุดที่คนนั้นเลือก ถ้ายังไม่ได้เลือกใช้ชุดของผู้ดู (เหมือนบนกระดาน)
  const { set: localSet } = useSetPrefs()
  const seatSet = SETS.find((s) => s.id === seat?.set) ?? localSet
  // ปุ่มเชิญออกอยู่บนที่นั่งของอีกคนเท่านั้น
  const canKick = !!seat && !seat.you && !!onKick
  return (
    <div className={`lobby-seat ${status}`}>
      {seat ? (
        <Avatar avatar={seat.avatar ?? ''} size={72} fallback={<HeroDuo set={seatSet} />} />
      ) : (
        <span className="lobby-seat-empty" aria-hidden="true" />
      )}
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
              <p>ที่นั่งจะว่างให้คนอื่นมาเล่นแทน เขายังดูเกมได้ แต่กลับมานั่งในห้องนี้ไม่ได้แล้ว</p>
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
      {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
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

/** ตัวละครสองตัวของชุด ใช้แทนรูปโปรไฟล์ในห้องรอ (ยังไม่รู้ว่าจะได้ฝ่ายไหนจนกว่าจะสุ่ม จึงแสดงทั้งคู่) */
function HeroDuo({ set }: { set: BoardSet }) {
  return (
    <span className="hero-duo" style={{ background: set.dark }}>
      {heroSvg(set, 'b', { className: 'hero-duo-back' })}
      {heroSvg(set, 'w', { className: 'hero-duo-front' })}
    </span>
  )
}

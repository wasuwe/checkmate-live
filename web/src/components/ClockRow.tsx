import { formatClock, LOW_TIME_MS } from '../lib/clock'
import { Avatar } from './Avatar'

interface Props {
  /** ชื่อผู้เล่น */
  label: string
  /** ข้อความรองใต้ชื่อ เช่น ฝั่งที่เล่น */
  detail?: string
  /** รหัสรูปโปรไฟล์ (undefined = ไม่แสดงรูปเลย เช่น ตอนยังไม่มีผู้เล่น) */
  avatar?: string
  ms: number
  /** นาฬิกาของฝั่งนี้กำลังเดิน */
  running: boolean
  /** เกมไม่จับเวลา: แสดง ∞ แทนเวลา */
  untimed?: boolean
  /** เล่นการกะพริบบอกว่าเพิ่งถึงตาของแถบนี้ (เปลี่ยน key ของแถบเพื่อเล่นซ้ำ) */
  alert?: boolean
  /** ถ้าระบุ รูปผู้เล่นจะเป็นปุ่มเปิดแชท */
  chat?: {
    onOpen: () => void
    open: boolean
    /** จำนวนข้อความที่ยังไม่ได้อ่าน */
    unread: number
    /** ข้อความใหม่ที่เด้งขึ้นข้างรูป */
    bubble?: { who: string; text: string }
  }
}

/** แถบผู้เล่นและเวลาที่เหลือ วางเหนือและใต้กระดาน แถบของฝั่งที่ถึงตาเดินเป็นสีเหลือง */
export function ClockRow({ label, detail, avatar, ms, running, chat, alert = false, untimed = false }: Props) {
  const low = !untimed && ms < LOW_TIME_MS
  return (
    <div className={`clock-row${running ? ' running' : ''}${alert ? ' turn-alert' : ''}`}>
      <span className="clock-player">
        {chat ? (
          <button
            type="button"
            className="chat-avatar"
            aria-label={chat.unread > 0 ? `เปิดแชท มี ${chat.unread} ข้อความใหม่` : 'เปิดแชท'}
            aria-expanded={chat.open}
            onClick={chat.onOpen}
          >
            <Avatar avatar={avatar ?? ''} />
            {chat.unread > 0 ? (
              <span className="chat-badge unread">{chat.unread > 9 ? '9+' : chat.unread}</span>
            ) : (
              <span className="chat-badge" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="11" height="11">
                  <path d="M2 3.5h12v7H7l-3 2.5v-2.5H2z" fill="currentColor" />
                </svg>
              </span>
            )}
          </button>
        ) : (
          avatar !== undefined && <Avatar avatar={avatar} />
        )}
        <span className="clock-names">
          <span className="clock-label">{label}</span>
          {detail && <span className="clock-detail">{detail}</span>}
        </span>
        {/* ปุ่มแชทที่มีคำกำกับ: รูปผู้เล่นอย่างเดียวดูไม่ออกว่ากดเปิดแชทได้ (เจ้าของโปรเจกต์แจ้ง) */}
        {chat && (
          <button
            type="button"
            className={`chat-open${chat.unread > 0 ? ' unread' : ''}${chat.open ? ' open' : ''}`}
            aria-expanded={chat.open}
            aria-label={chat.unread > 0 ? `เปิดแชท มี ${chat.unread} ข้อความใหม่` : chat.open ? 'ปิดแชท' : 'เปิดแชท'}
            onClick={chat.onOpen}
          >
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path
                d="M3 3.5h14a1.5 1.5 0 0 1 1.5 1.5v7.5A1.5 1.5 0 0 1 17 14H9.2l-4.4 3.4V14H3a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 3 3.5z"
                fill="currentColor"
              />
            </svg>
            <span>แชท</span>
            {chat.unread > 0 && <b>{chat.unread > 9 ? '9+' : chat.unread}</b>}
          </button>
        )}
      </span>
      {chat?.bubble && (
        <button type="button" className="chat-bubble" onClick={chat.onOpen} aria-label={`ข้อความใหม่จาก ${chat.bubble.who}: ${chat.bubble.text} กดเพื่อเปิดแชท`}>
          <span className="chat-bubble-who">{chat.bubble.who}</span>
          <span className="chat-bubble-text">{chat.bubble.text}</span>
        </button>
      )}
      {untimed ? (
        <span className="clock-time untimed" aria-label="ไม่จับเวลา">
          ∞
        </span>
      ) : (
        <span className={`clock-time${low ? ' low' : ''}`} role="timer" aria-label={`เวลาของ${label}`}>
          {formatClock(ms)}
        </span>
      )}
    </div>
  )
}

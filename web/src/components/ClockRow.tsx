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
export function ClockRow({ label, detail, avatar, ms, running, chat }: Props) {
  const low = ms < LOW_TIME_MS
  return (
    <div className={`clock-row${running ? ' running' : ''}`}>
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
      </span>
      {chat?.bubble && (
        <button type="button" className="chat-bubble" onClick={chat.onOpen} aria-label={`ข้อความใหม่จาก ${chat.bubble.who}: ${chat.bubble.text} กดเพื่อเปิดแชท`}>
          <span className="chat-bubble-who">{chat.bubble.who}</span>
          <span className="chat-bubble-text">{chat.bubble.text}</span>
        </button>
      )}
      <span className={`clock-time${low ? ' low' : ''}`} role="timer" aria-label={`เวลาของ${label}`}>
        {formatClock(ms)}
      </span>
    </div>
  )
}

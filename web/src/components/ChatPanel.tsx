import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ChatItem, Color, PlayerInfo } from '../lib/protocol'
import { colorName } from '../lib/text'

interface Props {
  messages: ChatItem[]
  /** ผู้เล่นในห้อง ใช้แสดงชื่อผู้ส่ง */
  players?: Partial<Record<Color, PlayerInfo>>
  online: boolean
  /** เพิ่มขึ้นทุกครั้งที่เซิร์ฟเวอร์ปฏิเสธข้อความเพราะส่งถี่เกินไป */
  rateLimitedSeq: number
  sendChat: (text: string) => boolean
}

export const CHAT_MAX_LENGTH = 200

function sender(item: ChatItem, players: Props['players']): string {
  if (item.mine) return 'คุณ'
  if (item.from === '') return 'ผู้ชม'
  // มีชื่อก็แสดงชื่อ พร้อมสีกำกับ เพื่อให้รู้ว่าเป็นผู้เล่นฝั่งไหน
  const name = players?.[item.from]?.name
  return name ? `${name} (${colorName(item.from)})` : colorName(item.from)
}

/** แชทในห้อง ข้อความแสดงเป็น text ล้วนเสมอ ไม่ตีความเป็น HTML */
export function ChatPanel({ messages, players, online, rateLimitedSeq, sendChat }: Props) {
  const [text, setText] = useState('')
  const [dismissedSeq, setDismissedSeq] = useState(0)
  const listRef = useRef<HTMLOListElement>(null)
  const lastId = messages.at(-1)?.id ?? 0

  // เลื่อนลงล่างสุดเมื่อมีข้อความใหม่
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [lastId])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (trimmed === '') return
    if (sendChat(trimmed)) {
      setText('')
      setDismissedSeq(rateLimitedSeq)
    }
  }

  return (
    <section className="card chat" aria-label="แชทในห้อง">
      <h2>แชท</h2>
      {messages.length === 0 ? (
        <p className="chat-empty">ยังไม่มีข้อความ</p>
      ) : (
        <ol className="chat-list" ref={listRef} aria-live="polite">
          {messages.map((m) => (
            <li key={m.id} className={m.mine ? 'mine' : undefined}>
              <span className="chat-from">{sender(m, players)}</span>
              <span className="chat-text">{m.text}</span>
            </li>
          ))}
        </ol>
      )}
      <form className="row" onSubmit={onSubmit}>
        <input
          aria-label="ข้อความ"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="พิมพ์ข้อความ"
          autoComplete="off"
        />
        <button type="submit" disabled={!online || text.trim() === ''}>
          ส่ง
        </button>
      </form>
      {rateLimitedSeq > dismissedSeq && (
        <p className="error" role="alert">
          ส่งข้อความถี่เกินไป รอสักครู่แล้วลองใหม่
        </p>
      )}
    </section>
  )
}

import { useEffect, useState } from 'react'
import type { ChatItem } from '../lib/protocol'

/** เวลาที่ข้อความใหม่เด้งค้างไว้ข้างรูปผู้เล่น */
export const BUBBLE_MS = 6000

export interface ChatPopup {
  open: boolean
  setOpen: (open: boolean) => void
  /** ข้อความที่กำลังเด้งอยู่ หรือ null */
  bubble: ChatItem | null
  /** จำนวนข้อความจากคนอื่นที่ยังไม่ได้เปิดอ่าน */
  unread: number
}

/**
 * แชทระหว่างเกม (เจ้าของโปรเจกต์กำหนด): ปิดไว้ก่อน เปิดด้วยการกดรูปของฝ่ายตรงข้าม
 * เมื่อมีข้อความใหม่จากคนอื่นขณะปิดอยู่ ข้อความจะเด้งขึ้นข้างรูปชั่วครู่
 * `active` = อยู่ในหน้าเล่นเกม (ในห้องรอแชทเปิดอยู่ตลอด จึงถือว่าอ่านแล้วทุกข้อความ)
 */
export function useChatPopup(messages: ChatItem[], active: boolean): ChatPopup {
  const [open, setOpen] = useState(false)
  const [bubble, setBubble] = useState<ChatItem | null>(null)
  const last = messages.at(-1)
  const lastId = last?.id ?? 0
  const [tracked, setTracked] = useState({ id: lastId, len: messages.length })
  const [seen, setSeen] = useState(lastId)
  const reading = open || !active

  // ปรับค่าระหว่าง render (ไม่ใช้ effect) ตามแนวทางของ React เมื่อค่าขึ้นกับ props ที่เปลี่ยน
  if (tracked.id !== lastId || tracked.len !== messages.length) {
    // ข้อความที่มาทีละข้อความคือข้อความสด ส่วนประวัติแชทตอนเข้าห้องมาเป็นชุด จึงไม่เด้ง
    const live = messages.length === tracked.len + 1
    setTracked({ id: lastId, len: messages.length })
    if (live && last && !last.mine && !reading) setBubble(last)
  }
  if (reading && seen !== lastId) setSeen(lastId)
  if (reading && bubble) setBubble(null)

  const bubbleId = bubble?.id
  useEffect(() => {
    if (bubbleId === undefined) return
    const timer = setTimeout(() => setBubble((b) => (b?.id === bubbleId ? null : b)), BUBBLE_MS)
    return () => clearTimeout(timer)
  }, [bubbleId])

  const unread = reading ? 0 : messages.filter((m) => m.id > seen && !m.mine).length
  return { open, setOpen, bubble, unread }
}

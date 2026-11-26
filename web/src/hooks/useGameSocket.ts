import { useEffect, useRef, useState } from 'react'
import { socketUrl } from '../lib/api'
import { GameSocket, type Snapshot } from '../lib/gameSocket'
import type { Promo } from '../lib/protocol'
import { getToken } from '../lib/session'

const INITIAL: Snapshot = {
  connection: 'connecting',
  state: null,
  stateAt: 0,
  fatal: null,
  moveError: null,
  errorSeq: 0,
  chat: [],
  chatLimitedSeq: 0,
}

export interface GameConnection extends Snapshot {
  sendMove: (from: string, to: string, promo: Promo) => boolean
  sendResign: () => boolean
  sendChat: (text: string) => boolean
}

/**
 * เชื่อมต่อกับห้องและคืน state ล่าสุดจากเซิร์ฟเวอร์
 * component ที่เรียกต้องมี key เป็น roomId เพื่อให้เปลี่ยนห้องแล้วเริ่ม state ใหม่
 */
export function useGameSocket(roomId: string): GameConnection {
  const [snapshot, setSnapshot] = useState<Snapshot>(INITIAL)
  const socketRef = useRef<GameSocket | null>(null)

  useEffect(() => {
    const socket = new GameSocket({
      roomId,
      createSocket: () => new WebSocket(socketUrl()),
      getToken,
      onChange: (next) => {
        if (socketRef.current === socket) setSnapshot(next)
      },
    })
    socketRef.current = socket
    socket.start()

    // ออกจากหน้า (รวมถึงกรณีหน้าถูกเก็บใน back/forward cache) ต้องปิด socket ให้เซิร์ฟเวอร์รู้
    const onHide = () => socket.pause()
    const onShow = () => socket.resume()
    window.addEventListener('pagehide', onHide)
    window.addEventListener('pageshow', onShow)
    return () => {
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('pageshow', onShow)
      socketRef.current = null
      socket.stop()
    }
  }, [roomId])

  return {
    ...snapshot,
    sendMove: (from, to, promo) => socketRef.current?.sendMove(from, to, promo) ?? false,
    sendResign: () => socketRef.current?.sendResign() ?? false,
    sendChat: (text) => socketRef.current?.sendChat(text) ?? false,
  }
}

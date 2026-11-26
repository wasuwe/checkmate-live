import { useEffect, useRef, useState } from 'react'
import { getToken, socketUrl } from '../lib/api'
import { GameSocket, type Snapshot } from '../lib/gameSocket'
import type { Promo } from '../lib/protocol'

const INITIAL: Snapshot = {
  connection: 'connecting',
  state: null,
  fatal: null,
  moveError: null,
  errorSeq: 0,
}

export interface GameConnection extends Snapshot {
  sendMove: (from: string, to: string, promo: Promo) => boolean
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
    return () => {
      socketRef.current = null
      socket.stop()
    }
  }, [roomId])

  return {
    ...snapshot,
    sendMove: (from, to, promo) => socketRef.current?.sendMove(from, to, promo) ?? false,
  }
}

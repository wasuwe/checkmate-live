import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { GameSocket, type Snapshot, type SocketLike } from './gameSocket'
import type { StateMsg } from './protocol'

const ROOM = 'abcdefghjkmn'

class FakeSocket implements SocketLike {
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  sent: Record<string, unknown>[] = []
  closed = false

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.readyState = 3
    this.onclose?.()
  }

  // ---- ตัวช่วยของ test: จำลองสิ่งที่เซิร์ฟเวอร์ทำ ----
  open(): void {
    this.readyState = 1
    this.onopen?.()
  }

  receive(msg: unknown): void {
    this.onmessage?.({ data: JSON.stringify(msg) })
  }
}

function stateMsg(patch: Partial<StateMsg> = {}): StateMsg {
  return {
    type: 'state',
    room: ROOM,
    status: 'playing',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    turn: 'w',
    ply: 0,
    you: { role: 'player', color: 'w' },
    tc: '10+0',
    clock: { w: 600000, b: 600000, running: 'w' },
    ...patch,
  }
}

function setup() {
  const sockets: FakeSocket[] = []
  const snapshots: Snapshot[] = []
  const getToken = vi.fn(async (forceNew: boolean) => (forceNew ? 'token-new' : 'token-old'))
  const socket = new GameSocket({
    roomId: ROOM,
    createSocket: () => {
      const s = new FakeSocket()
      sockets.push(s)
      return s
    },
    getToken,
    onChange: (s) => snapshots.push(s),
  })
  return { socket, sockets, snapshots, getToken }
}

/** ให้ promise ที่ค้างอยู่ (getToken) ทำงานจนจบ */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

test('sends auth first, then joins after auth_ok', async () => {
  const { socket, sockets } = setup()
  socket.start()
  await flush()

  const ws = sockets[0]
  expect(ws.sent).toEqual([]) // ยังไม่ส่งอะไรก่อน socket เปิด
  ws.open()
  expect(ws.sent).toEqual([{ type: 'auth', token: 'token-old' }])

  ws.receive({ type: 'auth_ok', userId: 'guest_1' })
  expect(ws.sent[1]).toEqual({ type: 'join', room: ROOM })
})

test('exposes server state and marks the connection open', async () => {
  const { socket, sockets } = setup()
  socket.start()
  await flush()
  sockets[0].open()
  sockets[0].receive({ type: 'auth_ok', userId: 'guest_1' })
  sockets[0].receive(stateMsg({ ply: 3 }))

  const snap = socket.getSnapshot()
  expect(snap.connection).toBe('open')
  expect(snap.state?.ply).toBe(3)
})

test('sendMove attaches the current ply', async () => {
  const { socket, sockets } = setup()
  socket.start()
  await flush()
  const ws = sockets[0]

  expect(socket.sendMove('e2', 'e4', '')).toBe(false) // ยังไม่มี state

  ws.open()
  ws.receive({ type: 'auth_ok', userId: 'guest_1' })
  ws.receive(stateMsg({ ply: 6 }))

  expect(socket.sendMove('e2', 'e4', '')).toBe(true)
  expect(ws.sent.at(-1)).toEqual({ type: 'move', ply: 6, from: 'e2', to: 'e4', promo: '' })
})

test('sendResign sends a bare resign message once connected', async () => {
  const { socket, sockets } = setup()
  socket.start()
  await flush()
  const ws = sockets[0]
  expect(socket.sendResign()).toBe(false) // socket ยังไม่เปิด

  ws.open()
  ws.receive({ type: 'auth_ok', userId: 'guest_1' })
  ws.receive(stateMsg())
  expect(socket.sendResign()).toBe(true)
  expect(ws.sent.at(-1)).toEqual({ type: 'resign' }) // ไม่มี winner/color

  ws.close()
  expect(socket.sendResign()).toBe(false)
})

test('records when the latest state arrived', async () => {
  const { socket, sockets } = setup()
  vi.setSystemTime(50_000)
  socket.start()
  await flush()
  sockets[0].open()
  sockets[0].receive(stateMsg())
  expect(socket.getSnapshot().stateAt).toBe(50_000)
})

test('move errors bump errorSeq even when the code repeats', async () => {
  const { socket, sockets } = setup()
  socket.start()
  await flush()
  sockets[0].open()
  sockets[0].receive({ type: 'error', code: 'illegal_move' })
  sockets[0].receive({ type: 'error', code: 'illegal_move' })

  const snap = socket.getSnapshot()
  expect(snap.moveError).toBe('illegal_move')
  expect(snap.errorSeq).toBe(2)
  expect(snap.fatal).toBeNull()
})

test('reconnects with backoff and rejoins the same room', async () => {
  const { socket, sockets } = setup()
  socket.start()
  await flush()
  sockets[0].open()
  sockets[0].receive({ type: 'auth_ok', userId: 'guest_1' })
  sockets[0].receive(stateMsg({ ply: 2 }))

  sockets[0].close() // เน็ตหลุด
  expect(socket.getSnapshot().connection).toBe('reconnecting')
  expect(socket.getSnapshot().state?.ply).toBe(2) // ยังแสดงกระดานล่าสุดระหว่างรอ
  expect(socket.sendMove('e2', 'e4', '')).toBe(false)

  await vi.advanceTimersByTimeAsync(499)
  expect(sockets).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(sockets).toHaveLength(2)

  // ครั้งที่สองล้มอีก: ต้องรอนานขึ้นเป็น 1000ms
  sockets[1].close()
  await vi.advanceTimersByTimeAsync(999)
  expect(sockets).toHaveLength(2)
  await vi.advanceTimersByTimeAsync(1)
  expect(sockets).toHaveLength(3)

  sockets[2].open()
  sockets[2].receive({ type: 'auth_ok', userId: 'guest_1' })
  expect(sockets[2].sent).toEqual([
    { type: 'auth', token: 'token-old' },
    { type: 'join', room: ROOM },
  ])
  sockets[2].receive(stateMsg({ ply: 5 }))
  expect(socket.getSnapshot().connection).toBe('open')
  expect(socket.getSnapshot().state?.ply).toBe(5)
})

test('room_not_found is fatal and stops reconnecting', async () => {
  const { socket, sockets } = setup()
  socket.start()
  await flush()
  sockets[0].open()
  sockets[0].receive({ type: 'auth_ok', userId: 'guest_1' })
  sockets[0].receive({ type: 'error', code: 'room_not_found' })

  expect(socket.getSnapshot().fatal).toBe('room_not_found')
  expect(sockets[0].closed).toBe(true)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(sockets).toHaveLength(1)
})

test('unauthorized requests a fresh token once, then gives up', async () => {
  const { socket, sockets, getToken } = setup()
  socket.start()
  await flush()
  sockets[0].open()
  sockets[0].receive({ type: 'error', code: 'unauthorized' })
  sockets[0].close() // เซิร์ฟเวอร์ปิดหลังปฏิเสธ token

  await vi.advanceTimersByTimeAsync(500)
  expect(getToken).toHaveBeenLastCalledWith(true)
  sockets[1].open()
  expect(sockets[1].sent[0]).toEqual({ type: 'auth', token: 'token-new' })

  sockets[1].receive({ type: 'error', code: 'unauthorized' })
  expect(socket.getSnapshot().fatal).toBe('unauthorized')
  await vi.advanceTimersByTimeAsync(60_000)
  expect(sockets).toHaveLength(2)
})

test('retries when the token request fails', async () => {
  const { socket, sockets, getToken } = setup()
  getToken.mockRejectedValueOnce(new Error('offline'))
  socket.start()
  await flush()
  expect(sockets).toHaveLength(0)
  expect(socket.getSnapshot().connection).toBe('reconnecting')

  await vi.advanceTimersByTimeAsync(500)
  expect(sockets).toHaveLength(1)
})

test('stop closes the socket and cancels pending reconnects', async () => {
  const { socket, sockets } = setup()
  socket.start()
  await flush()
  sockets[0].open()
  sockets[0].close()
  expect(socket.getSnapshot().connection).toBe('reconnecting')

  socket.stop()
  await vi.advanceTimersByTimeAsync(60_000)
  expect(sockets).toHaveLength(1)
  expect(socket.getSnapshot().connection).toBe('closed')
})

test('pause closes the socket without reconnecting; resume rejoins', async () => {
  const { socket, sockets } = setup()
  socket.start()
  await flush()
  sockets[0].open()
  sockets[0].receive({ type: 'auth_ok', userId: 'guest_1' })
  sockets[0].receive(stateMsg({ ply: 4 }))

  socket.pause() // ผู้ใช้ออกจากหน้า
  expect(sockets[0].closed).toBe(true)
  expect(socket.sendMove('e2', 'e4', '')).toBe(false)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(sockets).toHaveLength(1) // ไม่ลองต่อใหม่ระหว่างที่หน้าถูกซ่อน

  socket.resume() // กดย้อนกลับมาที่หน้าเดิม
  await flush()
  expect(sockets).toHaveLength(2)
  sockets[1].open()
  sockets[1].receive({ type: 'auth_ok', userId: 'guest_1' })
  expect(sockets[1].sent.at(-1)).toEqual({ type: 'join', room: ROOM })
  sockets[1].receive(stateMsg({ ply: 4 }))
  expect(socket.getSnapshot().connection).toBe('open')
})

test('pause cancels a pending reconnect and resume is a no-op when not paused', async () => {
  const { socket, sockets } = setup()
  socket.start()
  await flush()
  sockets[0].open()
  sockets[0].close()
  socket.pause()
  await vi.advanceTimersByTimeAsync(60_000)
  expect(sockets).toHaveLength(1)

  socket.resume()
  socket.resume()
  await flush()
  expect(sockets).toHaveLength(2)
})

const chatItem = (id: number, text: string, mine = false) => ({
  id,
  from: 'w' as const,
  text,
  at: 1000 + id,
  mine,
})

async function joined() {
  const ctx = setup()
  ctx.socket.start()
  await flush()
  const ws = ctx.sockets[0]
  ws.open()
  ws.receive({ type: 'auth_ok', userId: 'guest_1' })
  ws.receive(stateMsg())
  return { ...ctx, ws }
}

test('sendChat sends the text once joined', async () => {
  const { socket, sockets } = setup()
  socket.start()
  await flush()
  sockets[0].open()
  expect(socket.sendChat('hi')).toBe(false) // ยังไม่ได้เข้าห้อง

  sockets[0].receive({ type: 'auth_ok', userId: 'guest_1' })
  sockets[0].receive(stateMsg())
  expect(socket.sendChat('hi')).toBe(true)
  expect(sockets[0].sent.at(-1)).toEqual({ type: 'chat', text: 'hi' })
})

test('collects chat messages in order and drops duplicates', async () => {
  const { socket, ws } = await joined()
  ws.receive({ type: 'chat', ...chatItem(1, 'one') })
  ws.receive({ type: 'chat', ...chatItem(2, 'two', true) })
  ws.receive({ type: 'chat', ...chatItem(2, 'two', true) }) // ซ้ำ
  ws.receive({ type: 'chat', ...chatItem(1, 'one') }) // เก่ากว่า

  expect(socket.getSnapshot().chat).toEqual([chatItem(1, 'one'), chatItem(2, 'two', true)])
})

test('chat history replaces the list, so a reconnect does not duplicate messages', async () => {
  const { socket, sockets, ws } = await joined()
  ws.receive({ type: 'chat', ...chatItem(1, 'one') })
  ws.receive({ type: 'chat', ...chatItem(2, 'two') })

  ws.close()
  await vi.advanceTimersByTimeAsync(500)
  sockets[1].open()
  sockets[1].receive({ type: 'auth_ok', userId: 'guest_1' })
  sockets[1].receive({
    type: 'chat_history',
    messages: [chatItem(1, 'one'), chatItem(2, 'two'), chatItem(3, 'three')],
  })
  sockets[1].receive(stateMsg())

  expect(socket.getSnapshot().chat.map((m) => m.id)).toEqual([1, 2, 3])
  sockets[1].receive({ type: 'chat', ...chatItem(4, 'four') })
  expect(socket.getSnapshot().chat.map((m) => m.id)).toEqual([1, 2, 3, 4])
})

test('keeps only the most recent chat messages', async () => {
  const { socket, ws } = await joined()
  for (let id = 1; id <= 230; id++) ws.receive({ type: 'chat', ...chatItem(id, `m${id}`) })

  const chat = socket.getSnapshot().chat
  expect(chat).toHaveLength(200)
  expect(chat[0].id).toBe(31)
  expect(chat.at(-1)?.id).toBe(230)
})

test('chat rate limit does not count as a rejected move', async () => {
  const { socket, ws } = await joined()
  ws.receive({ type: 'error', code: 'chat_rate_limited' })

  const snap = socket.getSnapshot()
  expect(snap.chatLimitedSeq).toBe(1)
  expect(snap.errorSeq).toBe(0) // ไม่งั้นตาเดินที่รอยืนยันอยู่จะถูกยกเลิกบนจอ
  expect(snap.moveError).toBeNull()
})

test('ignores malformed and unknown server messages', async () => {
  const { socket, sockets } = setup()
  socket.start()
  await flush()
  sockets[0].open()
  sockets[0].onmessage?.({ data: 'not json' })
  sockets[0].receive({ type: 'mystery' })
  sockets[0].receive(null)

  expect(socket.getSnapshot().state).toBeNull()
  expect(socket.getSnapshot().errorSeq).toBe(0)
})

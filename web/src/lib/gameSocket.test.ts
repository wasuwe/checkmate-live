import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { deviceId } from './device'
import { GameSocket, HEARTBEAT_MS, PROBE_MS, SILENCE_MS, type Snapshot, type SocketLike } from './gameSocket'
import type { StateMsg } from './protocol'

const ROOM = '482915'

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
  expect(ws.sent[1]).toEqual({ type: 'join', room: ROOM, device: deviceId() })
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
    { type: 'join', room: ROOM, device: deviceId() },
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
  expect(sockets[1].sent.at(-1)).toEqual({ type: 'join', room: ROOM, device: deviceId() })
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
  sender: 'u1',
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

test('reports a chat message by id and records the acknowledgement', async () => {
  const { socket, ws } = await joined()
  expect(socket.sendReport(7)).toBe(true)
  expect(ws.sent.at(-1)).toEqual({ type: 'report', id: 7 }) // ไม่ส่งเนื้อความหรือผู้ส่ง เซิร์ฟเวอร์หาเอง
  expect(socket.getSnapshot().reported).toEqual([]) // ยังไม่นับจนกว่าเซิร์ฟเวอร์ตอบ

  ws.receive({ type: 'report_ok', id: 7 })
  ws.receive({ type: 'report_ok', id: 7 })
  expect(socket.getSnapshot().reported).toEqual([7])
})

test('cannot report before joining a room', async () => {
  const { socket, sockets } = setup()
  socket.start()
  await flush()
  sockets[0].open()
  expect(socket.sendReport(1)).toBe(false)
  expect(sockets[0].sent).toEqual([{ type: 'auth', token: 'token-old' }])
})

test('too many connections stops reconnecting', async () => {
  const { socket, sockets } = setup()
  socket.start()
  await flush()
  sockets[0].open()
  sockets[0].receive({ type: 'error', code: 'too_many_connections' })

  expect(socket.getSnapshot().fatal).toBe('too_many_connections')
  expect(sockets[0].closed).toBe(true)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(sockets).toHaveLength(1) // ไม่เปิด socket ใหม่มาเพิ่มภาระ
})

test('a dropped connection changes the session, so a move sent on it is not shown as made', async () => {
  const { socket, sockets, snapshots } = setup()
  socket.start()
  await flush()
  sockets[0].open()
  sockets[0].receive({ type: 'auth_ok' })
  sockets[0].receive(stateMsg())
  const before = snapshots.at(-1)!.session
  expect(socket.sendMove('e2', 'e4', '')).toBe(true)

  // เซิร์ฟเวอร์ดับก่อนตอบ: socket ปิด แล้วเชื่อมต่อใหม่ได้ state เดิม (ยังไม่มีตาเดินนั้น)
  sockets[0].close()
  expect(snapshots.at(-1)!.session).toBe(before + 1)
  await vi.advanceTimersByTimeAsync(1000)
  sockets[1].open()
  sockets[1].receive({ type: 'auth_ok' })
  sockets[1].receive(stateMsg())
  const after = snapshots.at(-1)!
  expect(after.session).toBe(before + 1)
  expect(after.state?.ply).toBe(0)
  socket.stop()
})

// ---------- การเชื่อมต่อที่ตายเงียบ ๆ (มือถือจอดับ สลับแอป สลับเครือข่าย) ----------

const pings = (ws: FakeSocket) => ws.sent.filter((m) => m.type === 'ping').length

test('pings the server on a timer while connected', async () => {
  const { ws } = await joined()
  expect(pings(ws)).toBe(0)
  await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
  expect(pings(ws)).toBe(1)
  ws.receive({ type: 'pong' })
  await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
  expect(pings(ws)).toBe(2)
})

test('a connection that stays alive is never replaced', async () => {
  const { socket, sockets, ws } = await joined()
  for (let i = 0; i < 30; i++) {
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
    ws.receive({ type: 'pong' })
  }
  expect(sockets).toHaveLength(1)
  expect(socket.getSnapshot().connection).toBe('open')
})

test('a connection that goes silent is dropped and replaced, and the new one shows the latest board', async () => {
  const { socket, sockets, ws } = await joined()
  const session = socket.getSnapshot().session
  // เซิร์ฟเวอร์ไม่ตอบอะไรเลย และเบราว์เซอร์ไม่เคยแจ้งว่า socket ปิด
  await vi.advanceTimersByTimeAsync(SILENCE_MS + HEARTBEAT_MS)
  expect(ws.closed).toBe(true)
  expect(sockets).toHaveLength(2)
  expect(socket.getSnapshot().connection).toBe('reconnecting')
  expect(socket.getSnapshot().session).toBeGreaterThan(session)

  sockets[1].open()
  sockets[1].receive({ type: 'auth_ok', userId: 'guest_1' })
  expect(sockets[1].sent.at(-1)).toEqual({ type: 'join', room: ROOM, device: deviceId() })
  sockets[1].receive(stateMsg({ ply: 9 }))
  expect(socket.getSnapshot().connection).toBe('open')
  expect(socket.getSnapshot().state?.ply).toBe(9)
})

test('coming back to the page checks the connection and keeps it when the server answers', async () => {
  const { socket, sockets, ws } = await joined()
  socket.wake()
  expect(pings(ws)).toBe(1)
  socket.wake() // เหตุการณ์ซ้อนกัน (focus + visibilitychange) ถามครั้งเดียวพอ
  expect(pings(ws)).toBe(1)
  ws.receive({ type: 'pong' })
  await vi.advanceTimersByTimeAsync(PROBE_MS + 1)
  expect(sockets).toHaveLength(1)
  expect(ws.closed).toBe(false)
})

test('coming back to the page with a dead connection reconnects within seconds', async () => {
  const { socket, sockets, ws } = await joined()
  // โทรศัพท์หลับไปนาน: ตัวจับเวลาของหน้าเว็บหยุดเดิน จึงไม่มี ping ระหว่างนั้น แล้วผู้ใช้กลับมา
  socket.wake()
  await vi.advanceTimersByTimeAsync(PROBE_MS)
  expect(ws.closed).toBe(true)
  expect(sockets).toHaveLength(2)
})

test('coming back while waiting to retry reconnects at once, and resumes a paused socket', async () => {
  const { socket, sockets, ws } = await joined()
  ws.close() // หลุด: กำลังรอ 500ms ก่อนลองใหม่
  expect(sockets).toHaveLength(1)
  socket.wake()
  await flush()
  expect(sockets).toHaveLength(2)

  // บางเบราว์เซอร์ส่ง pagehide ตอนสลับแอป แต่ไม่ส่ง pageshow ตอนกลับมา: wake ต้องต่อใหม่ให้
  socket.pause()
  await vi.advanceTimersByTimeAsync(60_000)
  expect(sockets).toHaveLength(2)
  socket.wake()
  await flush()
  expect(sockets).toHaveLength(3)
})

test('waking twice while the token is still being fetched opens a single socket', async () => {
  const { socket, sockets, ws } = await joined()
  ws.close()
  socket.wake()
  socket.wake()
  await vi.advanceTimersByTimeAsync(2000)
  expect(sockets).toHaveLength(2)
})

test('no pings and no reconnects after stop or a fatal error', async () => {
  const a = await joined()
  a.socket.stop()
  await vi.advanceTimersByTimeAsync(5 * SILENCE_MS)
  a.socket.wake()
  expect(pings(a.ws)).toBe(0)
  expect(a.sockets).toHaveLength(1)

  const b = await joined()
  b.ws.receive({ type: 'error', code: 'room_not_found' })
  await vi.advanceTimersByTimeAsync(5 * SILENCE_MS)
  b.socket.wake()
  expect(b.sockets).toHaveLength(1)
})

// ---------- ย้ายเครื่อง ----------

test('the join message carries the same device id every time, in the shape the server accepts', async () => {
  expect(deviceId()).toMatch(/^[A-Za-z0-9_-]{8,40}$/)
  expect(deviceId()).toBe(deviceId())
  const { ws } = await joined()
  expect(ws.sent[1]).toEqual({ type: 'join', room: ROOM, device: deviceId() })
})

test('moving to this device sends takeover; being moved away is fatal and never reconnects', async () => {
  // เครื่องใหม่: ถูกถาม (you.elsewhere) แล้วกดย้าย
  const fresh = await joined()
  fresh.ws.receive(stateMsg({ you: { role: 'player', color: 'w', elsewhere: true } }))
  expect(fresh.socket.getSnapshot().state?.you.elsewhere).toBe(true)
  expect(fresh.socket.sendTakeover()).toBe(true)
  expect(fresh.ws.sent.at(-1)).toEqual({ type: 'takeover' })

  // เครื่องเดิม: ได้ moved แล้วต้องปิดและไม่ต่อกลับเอง ไม่งั้นสองเครื่องจะแย่งห้องกันไปมา
  const old = await joined()
  old.ws.receive({ type: 'moved' })
  expect(old.socket.getSnapshot().fatal).toBe('moved')
  expect(old.ws.closed).toBe(true)
  await vi.advanceTimersByTimeAsync(5 * SILENCE_MS)
  old.socket.wake()
  expect(old.sockets).toHaveLength(1)
  expect(old.socket.sendTakeover()).toBe(false)
})

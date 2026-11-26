// การเชื่อมต่อ WebSocket ของห้องหนึ่งห้อง: auth → join → รับ state
// state จากเซิร์ฟเวอร์เป็นความจริงเดียว ไฟล์นี้ไม่คำนวณกติกาเอง

import { parseServerMsg, type ClientMsg, type Promo, type StateMsg } from './protocol'

export type Connection = 'connecting' | 'open' | 'reconnecting' | 'closed'

/** สาเหตุที่ทำให้เลิกเชื่อมต่อถาวร */
export type Fatal = 'room_not_found' | 'unauthorized'

export interface Snapshot {
  connection: Connection
  state: StateMsg | null
  /** เวลา (ms) ที่ได้รับ state ล่าสุด ใช้นับถอยหลังจากค่าที่เซิร์ฟเวอร์ส่งมา */
  stateAt: number
  fatal: Fatal | null
  /** รหัส error ล่าสุดของตาเดินที่ถูกปฏิเสธ (เช่น illegal_move) */
  moveError: string | null
  /** เพิ่มทุกครั้งที่มี error เพื่อให้ UI รู้ว่าเป็นเหตุการณ์ใหม่แม้รหัสซ้ำ */
  errorSeq: number
}

/** ส่วนของ WebSocket ที่ใช้จริง แยกไว้เพื่อให้ test ใส่ตัวปลอมได้ */
// พารามิเตอร์ของ handler เป็น never เพื่อให้ทั้ง WebSocket จริงและตัวปลอมใน test ใช้ interface นี้ได้
export interface SocketLike {
  readyState: number
  onopen: ((ev: never) => void) | null
  onmessage: ((ev: never) => void) | null
  onclose: ((ev: never) => void) | null
  send(data: string): void
  close(): void
}

export interface GameSocketOptions {
  roomId: string
  createSocket: () => SocketLike
  getToken: (forceNew: boolean) => Promise<string>
  onChange: (snapshot: Snapshot) => void
}

const OPEN = 1
const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 8000

export class GameSocket {
  private readonly opts: GameSocketOptions
  private ws: SocketLike | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private paused = false
  private attempt = 0
  private refreshToken = false
  private unauthorizedInARow = 0
  private snapshot: Snapshot = {
    connection: 'connecting',
    state: null,
    stateAt: 0,
    fatal: null,
    moveError: null,
    errorSeq: 0,
  }

  constructor(opts: GameSocketOptions) {
    this.opts = opts
  }

  getSnapshot(): Snapshot {
    return this.snapshot
  }

  start(): void {
    void this.open()
  }

  /** ปิดการเชื่อมต่อและเลิกลองใหม่ */
  stop(): void {
    this.stopped = true
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.update({ connection: 'closed' })
  }

  /**
   * ปิด socket ชั่วคราวเมื่อผู้ใช้ออกจากหน้า (pagehide)
   * เบราว์เซอร์อาจเก็บหน้าไว้ใน back/forward cache โดย socket ยังเปิดอยู่
   * ถ้าไม่ปิดเอง เซิร์ฟเวอร์จะคิดว่าผู้เล่นยังอยู่และไม่เริ่มนับเวลา abandon
   */
  pause(): void {
    if (this.stopped || this.paused) return
    this.paused = true
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.update({ connection: 'reconnecting' })
  }

  /** เชื่อมต่อใหม่เมื่อผู้ใช้กลับมาที่หน้าเดิม (pageshow) */
  resume(): void {
    if (this.stopped || !this.paused) return
    this.paused = false
    if (this.snapshot.fatal) return
    this.attempt = 0
    void this.open()
  }

  /** ส่งตาเดิน คืน false ถ้ายังส่งไม่ได้ (ยังไม่เชื่อมต่อหรือยังไม่มี state) */
  sendMove(from: string, to: string, promo: Promo): boolean {
    const state = this.snapshot.state
    if (!state || !this.ws || this.ws.readyState !== OPEN) return false
    this.send(this.ws, { type: 'move', ply: state.ply, from, to, promo })
    return true
  }

  /** ยอมแพ้ ผู้แพ้คือเจ้าของ connection นี้ เซิร์ฟเวอร์เป็นผู้ตัดสิน */
  sendResign(): boolean {
    if (!this.ws || this.ws.readyState !== OPEN) return false
    this.send(this.ws, { type: 'resign' })
    return true
  }

  private update(patch: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    this.opts.onChange(this.snapshot)
  }

  private send(ws: SocketLike, msg: ClientMsg): void {
    ws.send(JSON.stringify(msg))
  }

  private async open(): Promise<void> {
    let token: string
    try {
      token = await this.opts.getToken(this.refreshToken)
    } catch {
      this.scheduleReconnect()
      return
    }
    if (this.stopped || this.paused) return
    this.refreshToken = false

    const ws = this.opts.createSocket()
    this.ws = ws
    ws.onopen = () => this.send(ws, { type: 'auth', token })
    ws.onmessage = (ev: { data: unknown }) => {
      if (this.ws === ws) this.onMessage(ws, String(ev.data))
    }
    ws.onclose = () => {
      if (this.ws !== ws) return // socket เก่าที่ถูกแทนไปแล้ว
      this.ws = null
      if (!this.stopped && !this.snapshot.fatal) this.scheduleReconnect()
    }
  }

  private onMessage(ws: SocketLike, data: string): void {
    const msg = parseServerMsg(data)
    if (!msg) return

    switch (msg.type) {
      case 'auth_ok':
        this.unauthorizedInARow = 0
        this.send(ws, { type: 'join', room: this.opts.roomId })
        break

      case 'state':
        this.attempt = 0
        this.update({ connection: 'open', state: msg, stateAt: Date.now() })
        break

      case 'game_over':
        break // state ที่ตามมามีผลเกมครบแล้ว

      case 'error':
        this.onError(msg.code)
        break
    }
  }

  private onError(code: string): void {
    switch (code) {
      case 'room_not_found':
        this.fail('room_not_found')
        break
      case 'unauthorized':
        // token ใช้ไม่ได้ (เช่น เซิร์ฟเวอร์รีสตาร์ต): ขอตัวตนใหม่หนึ่งครั้ง ถ้ายังไม่ผ่านให้เลิก
        this.unauthorizedInARow += 1
        if (this.unauthorizedInARow > 1) {
          this.fail('unauthorized')
        } else {
          this.refreshToken = true // เซิร์ฟเวอร์จะปิด socket เอง แล้ว onclose จะลองใหม่
        }
        break
      default:
        this.update({ moveError: code, errorSeq: this.snapshot.errorSeq + 1 })
    }
  }

  private fail(fatal: Fatal): void {
    const ws = this.ws
    this.ws = null
    this.update({ fatal, connection: 'closed' })
    ws?.close()
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.paused || this.timer !== null) return
    const delay = Math.min(BASE_DELAY_MS * 2 ** this.attempt, MAX_DELAY_MS)
    this.attempt += 1
    this.update({ connection: 'reconnecting' })
    this.timer = setTimeout(() => {
      this.timer = null
      void this.open()
    }, delay)
  }
}

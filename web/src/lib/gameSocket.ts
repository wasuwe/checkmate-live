// การเชื่อมต่อ WebSocket ของห้องหนึ่งห้อง: auth → join → รับ state
// state จากเซิร์ฟเวอร์เป็นความจริงเดียว ไฟล์นี้ไม่คำนวณกติกาเอง

import {
  parseServerMsg,
  type ChatItem,
  type ClientMsg,
  type Promo,
  type StateMsg,
} from './protocol'
import { deviceId } from './device'

export type Connection = 'connecting' | 'open' | 'reconnecting' | 'closed'

/** สาเหตุที่ทำให้เลิกเชื่อมต่อถาวร */
/** 'moved' = ผู้ใช้ย้ายไปเล่นห้องนี้ที่อีกเครื่อง หน้านี้จึงออกจากห้อง */
export type Fatal = 'room_not_found' | 'unauthorized' | 'too_many_connections' | 'moved'

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
  /** ข้อความแชทในห้อง เรียงจากเก่าไปใหม่ */
  chat: ChatItem[]
  /** เพิ่มทุกครั้งที่เซิร์ฟเวอร์ปฏิเสธแชทเพราะส่งถี่เกินไป (แยกจาก errorSeq ที่ใช้กับตาเดิน) */
  chatLimitedSeq: number
  /** id ของข้อความแชทที่เซิร์ฟเวอร์รับการรายงานแล้ว */
  reported: number[]
  /**
   * เพิ่มทุกครั้งที่การเชื่อมต่อขาด ตาเดินที่ส่งไปบน socket เดิมแล้วยังไม่ได้คำตอบอาจไม่ถึงเซิร์ฟเวอร์
   * (เช่น เซิร์ฟเวอร์ดับกลางทาง) หน้าเว็บจึงต้องเลิกแสดงตาเดินนั้นเมื่อค่านี้เปลี่ยน แล้วเชื่อ state ใหม่จากเซิร์ฟเวอร์
   */
  session: number
}

/** จำนวนข้อความแชทสูงสุดที่เก็บไว้ในหน้าเว็บ */
const CHAT_KEEP = 200

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

// ---- ตรวจว่าการเชื่อมต่อยังใช้ได้จริง ----
// WebSocket ที่ "เปิดอยู่" อาจตายไปแล้วโดยเบราว์เซอร์ไม่บอก พบบ่อยบนมือถือ: จอดับ สลับไปแอปอื่น
// หรือสลับระหว่าง Wi-Fi กับเน็ตมือถือ ผลคือหน้าจอค้างอยู่ที่ตำแหน่งเดิมจนกว่าจะโหลดหน้าใหม่
// (เจ้าของโปรเจกต์เจอบนโทรศัพท์ 2026-11-28) จึงส่ง ping เป็นระยะ ถ้าเงียบนานเกินไปถือว่าตายแล้วต่อใหม่เอง
/** ส่ง ping ทุกเท่านี้ */
export const HEARTBEAT_MS = 5_000
/** ไม่ได้ยินอะไรจากเซิร์ฟเวอร์นานเท่านี้ = การเชื่อมต่อตายแล้ว (ping หายไปสองครั้ง) */
export const SILENCE_MS = 12_000
/** ตอนกลับมาที่หน้า (หรือเครือข่ายกลับมา) รอคำตอบของ ping ได้เท่านี้ */
export const PROBE_MS = 3_000

export class GameSocket {
  private readonly opts: GameSocketOptions
  private ws: SocketLike | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private paused = false
  private attempt = 0
  private refreshToken = false
  /** เวลาที่ได้รับข้อความล่าสุดจากเซิร์ฟเวอร์ */
  private heardAt = 0
  /** จำนวนข้อความที่ได้รับ ใช้ดูว่าหลังถามเซิร์ฟเวอร์แล้วมีอะไรตอบกลับมาหรือไม่ */
  private heard = 0
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private probe: ReturnType<typeof setTimeout> | null = null
  /** เพิ่มทุกครั้งที่เริ่มเชื่อมต่อ การเชื่อมต่อรอบเก่าที่ยังรอ token อยู่จะรู้ว่าถูกแทนแล้ว */
  private opening = 0
  private unauthorizedInARow = 0
  private snapshot: Snapshot = {
    connection: 'connecting',
    state: null,
    stateAt: 0,
    fatal: null,
    moveError: null,
    errorSeq: 0,
    chat: [],
    chatLimitedSeq: 0,
    reported: [],
    session: 0,
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
    this.stopWatching()
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.update({ connection: 'closed', session: this.snapshot.session + 1 })
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
    this.stopWatching()
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.update({ connection: 'reconnecting', session: this.snapshot.session + 1 })
  }

  /** เชื่อมต่อใหม่เมื่อผู้ใช้กลับมาที่หน้าเดิม (pageshow) */
  resume(): void {
    if (this.stopped || !this.paused) return
    this.paused = false
    if (this.snapshot.fatal) return
    this.attempt = 0
    void this.open()
  }

  /**
   * เรียกเมื่อผู้ใช้กลับมาที่หน้า หรือเครือข่ายกลับมา (visibilitychange, focus, online, pageshow)
   * ถ้าถูกพักไว้ก็ต่อใหม่ ถ้ากำลังรอลองใหม่ก็ลองทันที ถ้าดูเหมือนเชื่อมต่ออยู่ก็ถามเซิร์ฟเวอร์ให้แน่ใจ
   * แล้วต่อใหม่ถ้าไม่ได้คำตอบใน PROBE_MS
   */
  wake(): void {
    if (this.stopped || this.snapshot.fatal) return
    if (this.paused) {
      this.resume()
      return
    }
    const ws = this.ws
    if (ws === null) {
      // กำลังรอเวลาลองใหม่: ไม่ต้องรอแล้ว (ถ้ากำลังขอ token อยู่ก็ปล่อยให้ทำต่อ)
      if (this.timer !== null) {
        clearTimeout(this.timer)
        this.timer = null
        this.attempt = 0
        void this.open()
      }
      return
    }
    if (ws.readyState !== OPEN || this.probe !== null) return
    const before = this.heard
    this.send(ws, { type: 'ping' })
    this.probe = setTimeout(() => {
      this.probe = null
      if (this.ws === ws && this.heard === before) this.restart()
    }, PROBE_MS)
  }

  /** ทิ้งการเชื่อมต่อที่ตายแล้วและต่อใหม่ทันที */
  private restart(): void {
    if (this.stopped || this.paused || this.snapshot.fatal) return
    this.stopWatching()
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.attempt = 0
    this.update({ connection: 'reconnecting', session: this.snapshot.session + 1 })
    void this.open()
  }

  /** เริ่มส่ง ping เป็นระยะบน socket นี้ และต่อใหม่ถ้าเซิร์ฟเวอร์เงียบไปนาน */
  private watch(ws: SocketLike): void {
    this.stopWatching()
    this.heartbeat = setInterval(() => {
      if (this.ws !== ws) return
      if (Date.now() - this.heardAt > SILENCE_MS) {
        this.restart()
      } else if (ws.readyState === OPEN) {
        this.send(ws, { type: 'ping' })
      }
    }, HEARTBEAT_MS)
  }

  private stopWatching(): void {
    if (this.heartbeat !== null) clearInterval(this.heartbeat)
    this.heartbeat = null
    if (this.probe !== null) clearTimeout(this.probe)
    this.probe = null
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

  /** ส่งข้อความแชท คืน false ถ้ายังไม่ได้เชื่อมต่อ */
  sendChat(text: string): boolean {
    if (!this.snapshot.state || !this.ws || this.ws.readyState !== OPEN) return false
    this.send(this.ws, { type: 'chat', text })
    return true
  }

  /** บอกว่าพร้อมเริ่มเกมหรือยัง (ใช้ในห้องรอ) เซิร์ฟเวอร์เป็นผู้ตัดสินว่าเกมเริ่มเมื่อไหร่ */
  sendReady(ready: boolean): boolean {
    if (!this.snapshot.state || !this.ws || this.ws.readyState !== OPEN) return false
    this.send(this.ws, { type: 'ready', ready })
    return true
  }

  /** ขอเล่นต่อในห้องเดิมหลังเกมจบ เกมใหม่เริ่มเมื่อผู้เล่นทั้งสองขอ (เซิร์ฟเวอร์สุ่มฝ่ายใหม่) */
  sendRematch(): boolean {
    if (!this.snapshot.state || !this.ws || this.ws.readyState !== OPEN) return false
    this.send(this.ws, { type: 'rematch' })
    return true
  }

  /** ย้ายมาเล่นที่เครื่องนี้: เครื่องอื่นของผู้ใช้คนเดียวกันออกจากห้อง */
  sendTakeover(): boolean {
    if (!this.snapshot.state || !this.ws || this.ws.readyState !== OPEN) return false
    this.send(this.ws, { type: 'takeover' })
    return true
  }

  /** บอกชุดหมากรุกที่เลือก (ใช้ในห้องรอ) เซิร์ฟเวอร์รับเฉพาะก่อนเกมเริ่ม */
  sendSet(set: string): boolean {
    if (!this.snapshot.state || !this.ws || this.ws.readyState !== OPEN) return false
    this.send(this.ws, { type: 'set', set })
    return true
  }

  /** เชิญผู้เล่นอีกคนออกจากที่นั่งในห้องรอ เซิร์ฟเวอร์ตรวจเองว่าผู้ส่งเป็นเจ้าของห้อง และเป็นผู้ระบุว่าใครออก */
  sendKick(): boolean {
    if (!this.snapshot.state || !this.ws || this.ws.readyState !== OPEN) return false
    this.send(this.ws, { type: 'kick' })
    return true
  }

  /** รายงานข้อความแชท เซิร์ฟเวอร์เป็นผู้ระบุผู้ส่งและเนื้อความเองจาก id */
  sendReport(id: number): boolean {
    if (!this.snapshot.state || !this.ws || this.ws.readyState !== OPEN) return false
    this.send(this.ws, { type: 'report', id })
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
    const round = ++this.opening
    let token: string
    try {
      token = await this.opts.getToken(this.refreshToken)
    } catch {
      if (round === this.opening) this.scheduleReconnect()
      return
    }
    // ถูกหยุด ถูกพัก หรือมีการเชื่อมต่อรอบใหม่กว่าเริ่มไปแล้วระหว่างรอ token: รอบนี้เลิก
    if (this.stopped || this.paused || round !== this.opening) return
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
      this.stopWatching()
      this.update({ session: this.snapshot.session + 1 })
      if (!this.stopped && !this.snapshot.fatal) this.scheduleReconnect()
    }
  }

  private onMessage(ws: SocketLike, data: string): void {
    // ข้อความอะไรก็ตามแปลว่าการเชื่อมต่อยังใช้ได้
    this.heardAt = Date.now()
    this.heard += 1
    const msg = parseServerMsg(data)
    if (!msg) return

    switch (msg.type) {
      case 'pong':
        break // มีไว้ให้รู้ว่ายังเชื่อมต่ออยู่เท่านั้น

      case 'moved':
        // ย้ายไปเล่นที่อีกเครื่องแล้ว: เลิกเชื่อมต่อ ถ้าต่อกลับเองสองเครื่องจะแย่งห้องกันไปมา
        this.fail('moved')
        break

      case 'auth_ok':
        this.unauthorizedInARow = 0
        this.send(ws, { type: 'join', room: this.opts.roomId, device: deviceId() })
        this.watch(ws)
        break

      case 'state':
        this.attempt = 0
        this.update({ connection: 'open', state: msg, stateAt: Date.now() })
        break

      case 'game_over':
        break // state ที่ตามมามีผลเกมครบแล้ว

      case 'chat': {
        // หลัง reconnect ข้อความเดิมอาจมาซ้ำ จึงรับเฉพาะ id ที่ใหม่กว่า
        const lastId = this.snapshot.chat.at(-1)?.id ?? 0
        if (msg.id <= lastId) break
        const { type: _type, ...item } = msg
        this.update({ chat: [...this.snapshot.chat, item].slice(-CHAT_KEEP) })
        break
      }

      case 'chat_history':
        // เซิร์ฟเวอร์ส่งประวัติล่าสุดทุกครั้งที่เข้าห้อง ใช้แทนของเดิมทั้งหมด
        this.update({ chat: msg.messages.slice(-CHAT_KEEP) })
        break

      case 'report_ok':
        if (!this.snapshot.reported.includes(msg.id)) {
          this.update({ reported: [...this.snapshot.reported, msg.id] })
        }
        break

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
      case 'too_many_connections':
        // เปิดห้องไว้หลายแท็บเกินจำนวน ลองใหม่เองไม่ช่วย ต้องให้ผู้ใช้ปิดแท็บอื่นก่อน
        this.fail('too_many_connections')
        break
      case 'chat_rate_limited':
        this.update({ chatLimitedSeq: this.snapshot.chatLimitedSeq + 1 })
        break
      default:
        this.update({ moveError: code, errorSeq: this.snapshot.errorSeq + 1 })
    }
  }

  private fail(fatal: Fatal): void {
    this.stopWatching()
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

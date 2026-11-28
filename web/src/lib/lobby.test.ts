import { describe, expect, test } from 'vitest'
import { chatNames, countdownSeconds, lobbyHint, mySeat, SEAT_STATUS_TEXT, seatName, seatStatus } from './lobby'
import type { LobbyInfo, LobbySeat } from './protocol'

const seat = (patch: Partial<LobbySeat> = {}): LobbySeat => ({ connected: true, ready: false, ...patch })
const lobby = (seats: LobbySeat[], countdown?: number): LobbyInfo => ({ seats, countdown })

describe('lobby seats', () => {
  test('a seat shows the profile name, or what kind of player it is', () => {
    expect(seatName({ name: 'น้ำผึ้ง' })).toBe('น้ำผึ้ง')
    expect(seatName({ name: 'น้ำผึ้ง', you: true })).toBe('น้ำผึ้ง (คุณ)')
    expect(seatName({ guest: true })).toBe('ผู้เล่นรับเชิญ')
    expect(seatName({ guest: true, you: true })).toBe('ผู้เล่นรับเชิญ (คุณ)')
    expect(seatName({})).toBe('ผู้เล่น')
  })

  test('seat status: empty, away, ready or still waiting', () => {
    expect(seatStatus(undefined)).toBe('empty')
    expect(seatStatus(seat({ connected: false, ready: true }))).toBe('away') // หลุดอยู่ ไม่นับว่าพร้อม
    expect(seatStatus(seat({ ready: true }))).toBe('ready')
    expect(seatStatus(seat())).toBe('waiting')
    for (const text of Object.values(SEAT_STATUS_TEXT)) expect(text.length).toBeGreaterThan(0)
  })

  test('my seat is the one marked as mine; a spectator has none', () => {
    const mine = seat({ you: true })
    expect(mySeat(lobby([seat(), mine]))).toBe(mine)
    expect(mySeat(lobby([seat(), seat()]))).toBeUndefined()
  })
})

describe('lobby hint', () => {
  test('tells each person what the room is waiting for', () => {
    const me = (patch = {}) => seat({ you: true, ...patch })
    expect(lobbyHint(lobby([me()]))).toContain('ส่งรหัสหรือลิงก์ให้เพื่อน')
    expect(lobbyHint(lobby([me(), seat()]))).toBe('พร้อมแล้วกดปุ่มพร้อมได้เลย')
    expect(lobbyHint(lobby([me(), seat({ ready: true })]))).toBe('คู่แข่งพร้อมแล้ว กดพร้อมเพื่อเริ่มเกม')
    expect(lobbyHint(lobby([me({ ready: true }), seat()]))).toBe('รอคู่แข่งกดพร้อม')
    expect(lobbyHint(lobby([me({ ready: true }), seat({ connected: false })]))).toContain('คู่แข่งหลุดไป')
    expect(lobbyHint(lobby([me({ ready: true }), seat({ ready: true })], 3000))).toContain('เกมกำลังจะเริ่ม')
    // ผู้ชม
    expect(lobbyHint(lobby([seat()]))).toBe('รอผู้เล่นเข้าห้อง')
    expect(lobbyHint(lobby([seat(), seat()]))).toContain('คุณเป็นผู้ชม')
    // คนที่ถูกเชิญออกจากที่นั่ง: บอกตรง ๆ ไม่ใช่ข้อความของผู้ชมทั่วไป
    expect(lobbyHint({ seats: [seat()], removed: true })).toContain('เชิญคุณออกจากที่นั่ง')
    expect(lobbyHint({ seats: [seat(), seat()], removed: true })).toContain('เชิญคุณออกจากที่นั่ง')
  })
})

describe('countdown', () => {
  test('counts down from what the server sent, rounding up, and never shows zero', () => {
    const l = lobby([seat(), seat()], 3000)
    expect(countdownSeconds(l, 1000, 1000)).toBe(3)
    expect(countdownSeconds(l, 1000, 1001)).toBe(3)
    expect(countdownSeconds(l, 1000, 2000)).toBe(2)
    expect(countdownSeconds(l, 1000, 3999)).toBe(1)
    expect(countdownSeconds(l, 1000, 9000)).toBe(1) // เซิร์ฟเวอร์เป็นผู้เริ่มเกม หน้าเว็บค้างที่ 1 จนกว่าจะได้ state ใหม่
    expect(countdownSeconds(l, 5000, 1000)).toBe(3) // นาฬิกาเครื่องเดินถอยหลังก็ไม่เกินค่าเริ่ม
  })

  test('there is no countdown until everyone is ready', () => {
    expect(countdownSeconds(lobby([seat(), seat()]), 0, 0)).toBeNull()
    expect(countdownSeconds(lobby([seat(), seat()], 0), 0, 0)).toBeNull()
  })
})

describe('chat names', () => {
  test('lobby chat is labelled with the seat name', () => {
    const names = chatNames({ lobby: lobby([seat({ sender: 'u1', name: 'น้ำผึ้ง' }), seat({ sender: 'u2', guest: true }), seat({ name: 'ไม่มีเลข' })]) })
    expect(names).toEqual({ u1: 'น้ำผึ้ง', u2: 'ผู้เล่นรับเชิญ' })
  })

  test('during the game the label also says which side the player is on', () => {
    const names = chatNames({
      players: { w: { connected: true, name: 'น้ำผึ้ง', sender: 'u1' }, b: { connected: true, guest: true, sender: 'u2' } },
    })
    expect(names).toEqual({ u1: 'น้ำผึ้ง (ขาว)', u2: 'ดำ' })
    expect(chatNames({})).toEqual({})
  })
})

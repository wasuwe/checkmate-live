import { describe, expect, test } from 'vitest'
import { clockAt } from './clock'
import type { StateMsg } from './protocol'
import { shouldToss, tossView, TOSS_MIN_MS, TOSS_TOTAL_MS } from './toss'

function state(patch: Partial<StateMsg> = {}): StateMsg {
  return {
    type: 'state',
    room: '482915',
    status: 'playing',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    turn: 'w',
    ply: 0,
    players: { w: { connected: true, name: 'น้ำผึ้ง' }, b: { connected: true, guest: true } },
    you: { role: 'player', color: 'w' },
    tc: '10+0',
    clock: { w: 600_000, b: 600_000, running: 'w', delay: 3500 },
    ...patch,
  }
}

describe('coin toss', () => {
  test('plays only for a game that has just started and whose clock is still waiting', () => {
    expect(shouldToss(state())).toBe(true)
    expect(shouldToss(state({ status: 'waiting' }))).toBe(false)
    expect(shouldToss(state({ ply: 1 }))).toBe(false)
    expect(shouldToss(state({ status: 'finished' }))).toBe(false)
    // เข้าห้องมาช้า หรือเซิร์ฟเวอร์ไม่ได้ตั้งเวลารอ: ไม่เล่น
    expect(shouldToss(state({ clock: { w: 1, b: 1, running: 'w', delay: TOSS_MIN_MS - 1 } }))).toBe(false)
    expect(shouldToss(state({ clock: { w: 1, b: 1, running: 'w' } }))).toBe(false)
  })

  // หมากรุกสากลและหมากรุกไทย: สุ่มฝ่ายขาว–ดำ ไม่ใช่สุ่มว่าใครเริ่มก่อน (เจ้าของโปรเจกต์กำหนด)
  test('chess: the coin has a white and a black face and lands on the colour the player got', () => {
    expect(tossView(state())).toEqual({
      title: 'สุ่มฝ่ายขาว–ดำ',
      faces: 'colors',
      front: 'ขาว',
      back: 'ดำ',
      landsOn: 'front',
      result: 'คุณได้ฝ่ายขาว เดินก่อน',
    })
    expect(tossView(state({ you: { role: 'player', color: 'b' } }))).toMatchObject({
      faces: 'colors',
      landsOn: 'back',
      result: 'คุณได้ฝ่ายดำ เดินทีหลัง',
    })
    expect(tossView(state({ game: 'makruk' })).faces).toBe('colors')
  })

  test('chess: a spectator sees who got which colour', () => {
    const view = tossView(state({ you: { role: 'spectator', color: '' } }))
    expect(view).toMatchObject({ faces: 'colors', front: 'ขาว', back: 'ดำ', result: 'ขาว: น้ำผึ้ง · ดำ: ผู้เล่นรับเชิญ' })
  })

  // หมากฮอสและหมากหนีบ: โยนหาคนเริ่มก่อนตามเดิม
  test('checkers and neeb: the player who moves first sees the coin land on their own side', () => {
    expect(tossView(state({ game: 'checkers' }))).toEqual({
      title: 'โยนเหรียญหาคนเริ่มก่อน',
      faces: 'sides',
      front: 'คุณ',
      back: 'คู่แข่ง',
      landsOn: 'front',
      result: 'คุณได้เริ่มก่อน!',
    })
    expect(tossView(state({ game: 'neeb', you: { role: 'player', color: 'b' } }))).toMatchObject({
      front: 'คุณ',
      back: 'คู่แข่ง',
      landsOn: 'back',
      result: 'คู่แข่งได้เริ่มก่อน',
    })
  })

  test('both players are told the same thing from their own point of view', () => {
    for (const game of ['chess', 'makruk', 'checkers', 'neeb'] as const) {
      const white = tossView(state({ game, you: { role: 'player', color: 'w' } }))
      const black = tossView(state({ game, you: { role: 'player', color: 'b' } }))
      expect(white.landsOn, game).not.toBe(black.landsOn)
    }
  })

  test('checkers: a spectator sees which colour starts, with the player name', () => {
    const view = tossView(state({ game: 'checkers', you: { role: 'spectator', color: '' } }))
    expect(view).toMatchObject({ front: 'ขาว', back: 'ดำ', landsOn: 'front', result: 'ฝ่ายขาว (น้ำผึ้ง) ได้เริ่มก่อน' })
  })

  test('the clock does not count down during the toss, and the picture ends before the clock starts', () => {
    const s = state()
    expect(clockAt(s, 1000, 1000 + 3000).w).toBe(600_000)
    expect(clockAt(s, 1000, 1000 + 3500 + 2000).w).toBe(598_000)
    expect(TOSS_TOTAL_MS).toBeLessThanOrEqual(3500)
  })
})

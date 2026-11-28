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
    clock: { w: 600_000, b: 600_000, running: 'w', delay: 5000 },
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

  // หมากรุกสากลและหมากรุกไทย: สุ่มฝ่ายขาวดำ ไม่ใช่สุ่มว่าใครเริ่มก่อน (เจ้าของโปรเจกต์กำหนด)
  test('chess: the coin has a white and a black face and lands on the colour the player got', () => {
    expect(tossView(state())).toMatchObject({
      title: 'สุ่มฝ่ายขาวดำ',
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
    expect(view).toMatchObject({ faces: 'colors', front: 'ขาว', back: 'ดำ', result: 'น้ำผึ้ง ได้ฝ่ายขาว ผู้เล่นรับเชิญ ได้ฝ่ายดำ' })
  })

  // หมากฮอสและหมากหนีบ: โยนหาคนเริ่มก่อนตามเดิม
  test('checkers and neeb: the player who moves first sees the coin land on their own side', () => {
    expect(tossView(state({ game: 'checkers' }))).toMatchObject({
      title: 'โยนเหรียญหาคนเดินก่อน',
      faces: 'sides',
      front: 'คุณ',
      back: 'คู่แข่ง',
      landsOn: 'front',
      result: 'คุณได้เดินก่อน!',
    })
    expect(tossView(state({ game: 'neeb', you: { role: 'player', color: 'b' } }))).toMatchObject({
      front: 'คุณ',
      back: 'คู่แข่ง',
      landsOn: 'back',
      result: 'คู่แข่งได้เดินก่อน',
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
    expect(view).toMatchObject({ front: 'ขาว', back: 'ดำ', landsOn: 'front', result: 'ฝ่ายขาว (น้ำผึ้ง) ได้เดินก่อน' })
  })

  test('the clock does not count down during the toss, and the picture ends before the clock starts', () => {
    const s = state()
    expect(clockAt(s, 1000, 1000 + 3000).w).toBe(600_000)
    expect(clockAt(s, 1000, 1000 + 5000 + 2000).w).toBe(598_000)
    // ภาพต้องจบก่อนนาฬิกาเริ่ม: START_DELAY ค่าเริ่มต้นของเซิร์ฟเวอร์คือ 5 วินาที (server/cmd/server/main.go)
    expect(TOSS_TOTAL_MS).toBeLessThanOrEqual(5000)
  })

  // ฉากหนังสือนิทาน: หน้าซ้ายขวาเป็นผู้เล่นสองฝั่ง ริบบิ้นบอกฝ่ายของแต่ละคน
  test('the storybook shows the viewer on the left page, and a ribbon for each side', () => {
    const players = { w: { connected: true, name: 'น้ำผึ้ง', set: 'sky' }, b: { connected: true, guest: true, set: 'cocoa' } }
    const asWhite = tossView(state({ players }))
    expect(asWhite.pages).toEqual([
      { color: 'w', name: 'น้ำผึ้ง', you: true, set: 'sky', ribbon: 'ฝ่ายขาว เดินก่อน' },
      { color: 'b', name: 'ผู้เล่นรับเชิญ', you: false, set: 'cocoa', ribbon: 'ฝ่ายดำ' },
    ])
    const asBlack = tossView(state({ players, you: { role: 'player', color: 'b' } }))
    expect(asBlack.pages.map((p) => [p.color, p.you])).toEqual([['b', true], ['w', false]])
    // ผู้ชมเห็นฝ่ายขาวอยู่หน้าซ้าย และไม่มีหน้าไหนเป็นของตัวเอง
    const watching = tossView(state({ players, you: { role: 'spectator', color: '' } }))
    expect(watching.pages.map((p) => [p.color, p.you])).toEqual([['w', false], ['b', false]])
    // หมากฮอสและหมากหนีบ: ริบบิ้นบอกว่าใครเดินก่อน
    expect(tossView(state({ game: 'checkers' })).pages.map((p) => p.ribbon)).toEqual(['เดินก่อน', 'เดินทีหลัง'])
  })
})

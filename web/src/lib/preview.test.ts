import { describe, expect, test } from 'vitest'
import { checkersApply, checkersPosition } from './checkers'
import cases from './fixtures/preview.json'
import { makrukApply, makrukPosition } from './makruk'
import { neebApply, neebPosition } from './neeb'

// ตำแหน่งจากเกมสุ่มที่สร้างโดยกติกาฝั่งเซิร์ฟเวอร์ (server/internal/game/playout_test.go)
// การแสดงผลล่วงหน้าของหน้าเว็บต้องให้กระดานเดียวกับที่เซิร์ฟเวอร์ได้หลังเดินทุกตา
// ถ้ากติกาฝั่งเซิร์ฟเวอร์เปลี่ยน test ฝั่ง Go จะบอกให้สร้างไฟล์นี้ใหม่

const APPLY = { makruk: makrukApply, checkers: checkersApply, neeb: neebApply } as const
const POSITION = { makruk: makrukPosition, checkers: checkersPosition, neeb: neebPosition } as const
type Game = keyof typeof APPLY

describe('move preview agrees with the server', () => {
  for (const game of Object.keys(APPLY) as Game[]) {
    const own = cases.filter((c) => c.game === game)

    test(`${game}: ${own.length} moves from random games give the same board`, () => {
      expect(own.length).toBeGreaterThan(100)
      for (const c of own) {
        const after = APPLY[game](c.fen, c.from, c.to)
        expect(after?.split(' ')[0], `${c.fen} ${c.from}${c.to}`).toBe(c.board)
      }
    })

    test(`${game}: every position can be drawn with the right number of pieces`, () => {
      for (const c of own) {
        const pieces = (c.fen.split(' ')[0].match(/[a-z]/gi) ?? []).length
        expect(Object.keys(POSITION[game](c.fen))).toHaveLength(pieces)
      }
    })
  }

  test('the fixtures include captures, promotions and multi-jumps', () => {
    const count = (s: string) => (s.match(/[a-z]/gi) ?? []).length
    const captures = (game: string) => cases.filter((c) => c.game === game && count(c.board) < count(c.fen.split(' ')[0])).length
    expect(captures('makruk')).toBeGreaterThan(5)
    expect(captures('checkers')).toBeGreaterThan(5)
    expect(captures('neeb')).toBeGreaterThan(5)
    expect(cases.some((c) => c.game === 'makruk' && /F/i.test(c.board) && !/F/i.test(c.fen))).toBe(true)
    expect(cases.some((c) => c.game === 'checkers' && /H/i.test(c.board) && !/H/i.test(c.fen))).toBe(true)
    expect(cases.some((c) => c.game === 'checkers' && c.forced && c.legal === 1)).toBe(true)
  })
})

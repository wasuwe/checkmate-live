import { describe, expect, test } from 'vitest'
import { gameName, GAMES, PLAYABLE } from './games'
import { boardPosition, chainSquare, checkSquareFor, needsPromotion, previewFor, targetsFor } from './moves'
import { neebApply, neebPosition, NEEB_START } from './neeb'
import { NEEB_KINDS, piecesFor, SETS } from './pieceSets'
import type { StateMsg } from './protocol'
import { reach, RULES } from './rules'

function state(patch: Partial<StateMsg> = {}): StateMsg {
  return {
    type: 'state',
    room: '482915',
    status: 'playing',
    game: 'neeb',
    fen: NEEB_START,
    turn: 'w',
    ply: 0,
    you: { role: 'player', color: 'w' },
    tc: '10+0',
    clock: { w: 600_000, b: 600_000, running: 'w' },
    legal: { a1: ['a2', 'a3', 'a4', 'a5', 'a6', 'a7'] },
    ...patch,
  }
}

describe('neeb position', () => {
  test('the start position has eight pieces a side on the first rows', () => {
    const pos = neebPosition(NEEB_START)
    expect(Object.keys(pos)).toHaveLength(16)
    for (const file of 'abcdefgh') {
      expect(pos[file + '1'].pieceType).toBe('wO')
      expect(pos[file + '8'].pieceType).toBe('bO')
    }
  })

  test('an unreadable position gives an empty board instead of throwing', () => {
    expect(neebPosition('')).toEqual({})
    expect(neebPosition('1c1c1c1c/c1c1c1c1/8/8/8/8/1C1C1C1C/C1C1C1C1 w')).toEqual({})
  })

  test('a plain move captures nothing and passes the turn', () => {
    expect(neebApply(NEEB_START, 'a1', 'a7')).toBe('oooooooo/O7/8/8/8/8/8/1OOOOOOO b')
    expect(neebApply(NEEB_START, 'a2', 'a3')).toBeNull() // ไม่มีหมากบนช่องต้นทาง
    expect(neebApply(NEEB_START, 'a1', 'b1')).toBeNull() // ช่องปลายทางมีหมากอยู่
  })

  // ผลต้องตรงกับฝั่งเซิร์ฟเวอร์ (server/internal/game/neeb_test.go ใช้ตำแหน่งชุดเดียวกัน)
  test.each([
    ['custodian along a row', '7o/8/8/8/8/8/2O5/Oo6 w', 'c2', 'c1', '7o/8/8/8/8/8/8/O1O5 b'],
    ['custodian along a column', '7o/8/8/8/8/O7/o7/1O6 w', 'b1', 'a1', '7o/8/8/8/8/O7/8/O7 b'],
    ['custodian takes a whole line', '7o/8/8/8/8/8/4O3/Oooo4 w', 'e2', 'e1', '7o/8/8/8/8/8/8/O3O3 b'],
    ['a gap in the line means no capture', '7o/8/8/8/8/8/4O3/Oo1o4 w', 'e2', 'e1', '7o/8/8/8/8/8/8/Oo1oO3 b'],
    ['the edge does not capture', '7o/8/8/8/8/8/1O6/o7 w', 'b2', 'b1', '7o/8/8/8/8/8/8/oO6 b'],
    ['intervention takes both neighbours', '7o/8/8/8/8/8/1O6/o1o5 w', 'b2', 'b1', '7o/8/8/8/8/8/8/1O6 b'],
    ['intervention along a column', '7o/8/8/o7/1O6/o7/8/8 w', 'b4', 'a4', '7o/8/8/8/O7/8/8/8 b'],
    ['both kinds at once', '7o/8/3O4/3o4/2o1o3/8/8/3O4 w', 'd1', 'd4', '7o/8/3O4/8/3O4/8/8/8 b'],
    ['black captures white the same way', '8/8/8/8/8/1o6/8/O1O4O b', 'b3', 'b1', '8/8/8/8/8/8/8/1o5O w'],
  ])('%s', (_name, fen, from, to, want) => {
    expect(neebApply(fen, from, to)).toBe(want)
  })
})

describe('neeb move helpers, games list and rules', () => {
  test('moves come from the server, with no promotion, check or capture chain', () => {
    const s = state()
    expect(targetsFor(s, 'a1')).toHaveLength(6)
    expect(targetsFor(s, 'b1')).toEqual([])
    expect(previewFor(s, 'a1', 'a7', '')).toBe('oooooooo/O7/8/8/8/8/8/1OOOOOOO b')
    expect(previewFor(s, 'a1', 'a8', '')).toBeNull()
    expect(needsPromotion(s, 'a1', 'a7')).toBe(false)
    expect(checkSquareFor(s, s.fen)).toBeNull()
    expect(chainSquare(state({ forced: true, lastMove: { from: 'a7', to: 'a1' } }))).toBeNull()
    expect(boardPosition('neeb', NEEB_START)).toHaveProperty('h8')
  })

  test('all four games are playable and none is marked as coming soon', () => {
    expect(PLAYABLE).toEqual(['chess', 'makruk', 'checkers', 'neeb'])
    expect(GAMES.map((g) => g.id)).toEqual(PLAYABLE)
    expect(GAMES.some((g) => g.soon)).toBe(false)
    expect(gameName('neeb')).toBe('หมากหนีบ')
  })

  test('the neeb piece can be drawn in every set', () => {
    for (const set of SETS) {
      const pieces = piecesFor(set)
      for (const kind of NEEB_KINDS) {
        expect(pieces['w' + kind]).toBeTypeOf('function')
        expect(pieces['b' + kind]).toBeTypeOf('function')
      }
    }
  })

  test('the rules explain both captures, with a picture for each', () => {
    const rules = RULES.neeb
    expect(rules.pieces.map((p) => p.kind)).toEqual(NEEB_KINDS)
    expect(rules.specials.map((s) => s.title)).toEqual(expect.arrayContaining(['หนีบ', 'สอด']))
    expect(rules.examples?.map((e) => e.title)).toEqual(['หนีบ', 'หนีบหลายตัว', 'สอด'])
    for (const ex of rules.examples ?? []) {
      expect(ex.rows).toHaveLength(5)
      for (const row of ex.rows) expect(row).toMatch(/^[Oox.]{5}$/)
    }
    expect(reach('O', 0, 2, 'neeb')).toBe('dot')
    expect(reach('O', -2, 0, 'neeb')).toBe('dot')
    expect(reach('O', 1, 1, 'neeb')).toBe('')
  })

  // ภาพตัวอย่างต้องเป็นจริงตามกติกา: หมากที่ทำเครื่องหมาย x คือหมากที่ถูกกินเมื่อหมากของเราเดินมาปิดแนว
  test('the example pictures agree with the capture rules', () => {
    const [custodian, line, intervention] = RULES.neeb.examples ?? []
    expect(custodian.rows[2]).toBe('.OxO.')
    expect(neebApply('7o/8/8/8/8/3O4/8/1Oo5 w', 'd3', 'd1')).toBe('7o/8/8/8/8/8/8/1O1O4 b')
    expect(line.rows[2]).toBe('OxxxO')
    expect(neebApply('7o/8/8/8/8/4O3/8/Oooo4 w', 'e3', 'e1')).toBe('7o/8/8/8/8/8/8/O3O3 b')
    expect(intervention.rows[2]).toBe('.xOx.')
    expect(neebApply('7o/8/8/8/8/2O5/8/1o1o4 w', 'c3', 'c1')).toBe('7o/8/8/8/8/8/8/2O5 b')
  })
})

describe('neeb result text', () => {
  test('winning by pieces says the opponent is down to two, not that everything was captured', async () => {
    const { resultParts } = await import('./text')
    const done = (game: 'neeb' | 'checkers') =>
      resultParts(state({ game, status: 'finished', result: '1-0', reason: 'wipeout' })).reason
    expect(done('neeb')).toBe('คู่แข่งเหลือหมากไม่เกิน 2 ตัว')
    expect(done('checkers')).toBe('กินหมากหมดกระดาน')
    expect(RULES.neeb.basics[0].body).toContain('เหลือ 2 ตัวหรือน้อยกว่า')
  })
})

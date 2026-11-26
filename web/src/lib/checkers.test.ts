import { describe, expect, test } from 'vitest'
import { checkersApply, checkersPosition, CHECKERS_START } from './checkers'
import { gameName, GAMES, isGameId, PLAYABLE } from './games'
import { boardPosition, chainSquare, checkSquareFor, needsPromotion, previewFor, targetsFor } from './moves'
import { CHECKERS_KINDS, piecesFor, SETS } from './pieceSets'
import type { StateMsg } from './protocol'
import { reach, RULES } from './rules'
import { forcedText, resultParts } from './text'

function state(patch: Partial<StateMsg> = {}): StateMsg {
  return {
    type: 'state',
    room: 'abcdefghjkmn',
    status: 'playing',
    game: 'checkers',
    fen: CHECKERS_START,
    turn: 'w',
    ply: 0,
    you: { role: 'player', color: 'w' },
    tc: '10+0',
    clock: { w: 600_000, b: 600_000, running: 'w' },
    legal: { b2: ['a3', 'c3'], d2: ['c3', 'e3'], f2: ['e3', 'g3'], h2: ['g3'] },
    ...patch,
  }
}

describe('checkers position', () => {
  test('the start position has eight men a side, all on dark squares', () => {
    const pos = checkersPosition(CHECKERS_START)
    const squares = Object.keys(pos)
    expect(squares).toHaveLength(16)
    expect(squares.filter((sq) => pos[sq].pieceType === 'wC').sort()).toEqual(
      ['a1', 'b2', 'c1', 'd2', 'e1', 'f2', 'g1', 'h2'],
    )
    expect(squares.filter((sq) => pos[sq].pieceType === 'bC')).toHaveLength(8)
    // a1 เป็นช่องสีเข้ม: ช่องที่ (คอลัมน์ + แถว) เป็นเลขคู่
    for (const sq of squares) expect((sq.charCodeAt(0) - 96 + Number(sq[1])) % 2).toBe(0)
  })

  test('an unreadable position gives an empty board instead of throwing', () => {
    expect(checkersPosition('')).toEqual({})
    expect(checkersPosition('rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w')).toEqual({})
  })

  test('a step moves the piece and keeps everything else', () => {
    expect(checkersApply(CHECKERS_START, 'b2', 'c3')).toBe('1c1c1c1c/c1c1c1c1/8/8/8/2C5/3C1C1C/C1C1C1C1 w')
    expect(checkersApply(CHECKERS_START, 'b3', 'c4')).toBeNull() // ไม่มีหมากบนช่องต้นทาง
    expect(checkersApply(CHECKERS_START, 'b2', 'b3')).toBeNull() // ไม่ใช่แนวทแยง
  })

  test('a jump removes the piece in between', () => {
    expect(checkersApply('8/8/8/8/3c4/2C5/8/8 w', 'c3', 'e5')).toBe('8/8/8/4C3/8/8/8/8 w')
    // ฮอสบินข้ามช่องว่างแล้วกินหมากที่อยู่ไกลออกไป
    expect(checkersApply('8/8/8/8/3c4/8/8/H7 w', 'a1', 'e5')).toBe('8/8/8/4H3/8/8/8/8 w')
    // ฮอสเดินผ่านช่องว่าง ไม่มีอะไรถูกกิน และหมากฝ่ายเดียวกันไม่ถูกลบ
    expect(checkersApply('8/8/8/8/8/8/8/H7 w', 'a1', 'd4')).toBe('8/8/8/8/3H4/8/8/8 w')
  })

  test('a man that reaches the last row becomes a king', () => {
    expect(checkersApply('8/6C1/8/8/8/8/8/8 w', 'g7', 'h8')).toBe('7H/8/8/8/8/8/8/8 w')
    expect(checkersApply('8/8/8/8/8/8/1c6/8 b', 'b2', 'a1')).toBe('8/8/8/8/8/8/8/h7 b')
  })
})

describe('checkers move helpers', () => {
  test('moves come from the server, and there is never a promotion dialog or a check', () => {
    const s = state()
    expect(targetsFor(s, 'b2')).toEqual(['a3', 'c3'])
    expect(targetsFor(s, 'a1')).toEqual([])
    expect(previewFor(s, 'b2', 'c3', '')).toBe('1c1c1c1c/c1c1c1c1/8/8/8/2C5/3C1C1C/C1C1C1C1 w')
    expect(previewFor(s, 'b2', 'd4', '')).toBeNull()
    expect(needsPromotion(state({ fen: '8/6C1/8/8/8/8/8/8 w', legal: { g7: ['h8'] } }), 'g7', 'h8')).toBe(false)
    expect(checkSquareFor(s, s.fen)).toBeNull()
    expect(boardPosition('checkers', CHECKERS_START)).toHaveProperty('a1')
  })

  test('the piece that must keep capturing is picked automatically', () => {
    const chain = state({ ply: 1, forced: true, lastMove: { from: 'c3', to: 'e5' }, legal: { e5: ['g7'] } })
    expect(chainSquare(chain)).toBe('e5')
    // บังคับกินตามปกติ (ยังไม่ได้เริ่มกิน) ไม่เลือกให้ แม้จะมีหมากกินได้ตัวเดียว
    expect(chainSquare(state({ forced: true, lastMove: { from: 'a7', to: 'b6' }, legal: { c3: ['e5'] } }))).toBeNull()
    expect(chainSquare(state())).toBeNull()
    expect(chainSquare(state({ game: 'makruk', forced: true, lastMove: { from: 'c3', to: 'e5' }, legal: { e5: ['g7'] } }))).toBeNull()
  })
})

describe('checkers in the games list, rules and text', () => {
  test('checkers is playable, and every game that is not playable is marked as coming soon', () => {
    expect(PLAYABLE).toContain('checkers')
    for (const g of GAMES) expect(g.soon).toBe(!isGameId(g.id))
    expect(gameName('checkers')).toBe('หมากฮอส')
  })

  test('men and kings can be drawn in every set, and a king looks different from a man', () => {
    for (const set of SETS) {
      const pieces = piecesFor(set)
      for (const kind of CHECKERS_KINDS) {
        expect(pieces['w' + kind]).toBeTypeOf('function')
        expect(pieces['b' + kind]).toBeTypeOf('function')
      }
    }
    const pieces = piecesFor(SETS[0])
    expect(JSON.stringify(pieces.wH().props.children)).not.toBe(JSON.stringify(pieces.wC().props.children))
    expect(JSON.stringify(pieces.wH().props.children)).toContain('♛')
  })

  test('the rules page shows how men and kings move', () => {
    expect(RULES.checkers.pieces.map((p) => p.kind)).toEqual(CHECKERS_KINDS)
    expect(RULES.checkers.specials.some((s) => s.title === 'บังคับกิน')).toBe(true)
    expect(reach('C', -1, 1, 'checkers')).toBe('dot')
    expect(reach('C', -2, -2, 'checkers')).toBe('ring')
    expect(reach('C', 1, 1, 'checkers')).toBe('') // เบี้ยถอยไม่ได้
    expect(reach('C', -1, 0, 'checkers')).toBe('')
    expect(reach('H', 2, -2, 'checkers')).toBe('dot')
    expect(reach('H', 0, 2, 'checkers')).toBe('')
  })

  test('the forced-capture hint is shown only to the player who has to move', () => {
    expect(forcedText(state({ forced: true }))).toBe('มีหมากให้กิน ต้องกินก่อน')
    expect(forcedText(state())).toBe('')
    expect(forcedText(state({ forced: true, you: { role: 'player', color: 'b' } }))).toBe('')
    expect(forcedText(state({ forced: true, you: { role: 'spectator', color: '' } }))).toBe('')
    expect(forcedText(state({ forced: true, status: 'finished' }))).toBe('')
  })

  test('the two ways to win are explained', () => {
    const done = (reason: string) => resultParts(state({ status: 'finished', result: '1-0', reason })).reason
    expect(done('wipeout')).toBe('กินหมากหมดกระดาน')
    expect(done('blocked')).toBe('ไม่มีตาเดินเหลือ')
  })
})

import { describe, expect, test } from 'vitest'
import { checkWords, gameName, gameOf, GAMES, isGameId, PLAYABLE } from './games'
import { makrukApply, makrukPosition, MAKRUK_START } from './makruk'
import { boardPosition, checkSquareFor, needsPromotion, previewFor, targetsFor } from './moves'
import { MAKRUK_KINDS, piecesFor, SETS } from './pieceSets'
import type { StateMsg } from './protocol'
import { reach, RULES } from './rules'
import { countText, resultParts } from './text'

function state(patch: Partial<StateMsg> = {}): StateMsg {
  return {
    type: 'state',
    room: 'abcdefghjkmn',
    status: 'playing',
    game: 'makruk',
    fen: MAKRUK_START,
    turn: 'w',
    ply: 0,
    you: { role: 'player', color: 'w' },
    tc: '10+0',
    clock: { w: 600_000, b: 600_000, running: 'w' },
    legal: { e3: ['e4'], d1: ['c2', 'd2', 'e2'] },
    ...patch,
  }
}

describe('makruk position', () => {
  test('the start position has 32 pieces, with the khun and met swapped between the sides', () => {
    const pos = makrukPosition(MAKRUK_START)
    expect(Object.keys(pos)).toHaveLength(32)
    expect(pos.d1.pieceType).toBe('wK')
    expect(pos.e1.pieceType).toBe('wM')
    expect(pos.e8.pieceType).toBe('bK')
    expect(pos.d8.pieceType).toBe('bM')
    expect(pos.c1.pieceType).toBe('wS')
    expect(pos.a3.pieceType).toBe('wP')
    expect(pos.h6.pieceType).toBe('bP')
    expect(pos.a2).toBeUndefined()
  })

  test('an unreadable position gives an empty board instead of throwing', () => {
    expect(makrukPosition('')).toEqual({})
    expect(makrukPosition('8/8/8 w')).toEqual({})
    expect(makrukPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toEqual({})
  })

  test('applying a move moves the piece and passes the turn', () => {
    expect(makrukApply(MAKRUK_START, 'e3', 'e4')).toBe('rnsmksnr/8/pppppppp/8/4P3/PPPP1PPP/8/RNSKMSNR b')
    expect(makrukApply(MAKRUK_START, 'e4', 'e5')).toBeNull() // ไม่มีหมากบนช่องต้นทาง
    expect(makrukApply(MAKRUK_START, 'e3', 'z9')).toBeNull()
  })

  test('a bia flips when it reaches its sixth rank, and captures replace the piece', () => {
    expect(makrukApply('4k3/8/8/3P4/8/8/8/K7 w', 'd5', 'd6')).toBe('4k3/8/3F4/8/8/8/8/K7 b')
    expect(makrukApply('4k3/8/8/8/2p5/8/8/K7 b', 'c4', 'c3')).toBe('4k3/8/8/8/8/2f5/8/K7 w')
    expect(makrukApply('4k3/8/8/8/8/2r5/8/K1R5 w', 'c1', 'c3')).toBe('4k3/8/8/8/8/2R5/8/K7 b')
  })
})

describe('game-aware move helpers', () => {
  test('makruk uses the legal moves the server sent', () => {
    const s = state()
    expect(targetsFor(s, 'e3')).toEqual(['e4'])
    expect(targetsFor(s, 'a3')).toEqual([]) // ไม่อยู่ในรายการ = เดินไม่ได้
    expect(previewFor(s, 'e3', 'e4', '')).toBe('rnsmksnr/8/pppppppp/8/4P3/PPPP1PPP/8/RNSKMSNR b')
    expect(previewFor(s, 'e3', 'e5', '')).toBeNull()
    expect(needsPromotion(state({ fen: '4k3/8/8/3P4/8/8/8/K7 w', legal: { d5: ['d6'] } }), 'd5', 'd6')).toBe(false)
  })

  test('makruk shows a check only for the position the server confirmed', () => {
    const s = state({ fen: '4k3/8/8/8/8/8/8/R3K3 b', check: 'e8' })
    expect(checkSquareFor(s, s.fen)).toBe('e8')
    expect(checkSquareFor(s, '4k3/8/8/8/8/8/8/1R2K3 w')).toBeNull()
    expect(checkSquareFor(state(), MAKRUK_START)).toBeNull()
  })

  test('chess still computes moves in the browser, also when the server sends no game', () => {
    const chess = state({
      game: undefined,
      legal: undefined,
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    })
    expect(gameOf(chess)).toBe('chess')
    expect(targetsFor(chess, 'e2').sort()).toEqual(['e3', 'e4'])
    expect(typeof boardPosition('chess', chess.fen)).toBe('string')
    expect(boardPosition('makruk', MAKRUK_START)).toHaveProperty('d1')
  })
})

describe('games list', () => {
  test('makruk is playable, and every game that is not playable is marked as coming soon', () => {
    expect(PLAYABLE).toContain('makruk')
    for (const g of GAMES) expect(g.soon).toBe(!isGameId(g.id))
    expect(gameName('makruk')).toBe('หมากรุกไทย')
    expect(gameOf({ game: 'makruk' })).toBe('makruk')
    expect(checkWords('makruk').mate).toBe('รุกจน!')
    expect(checkWords('chess').mate).toBe('รุกฆาต!')
  })

  test('every makruk piece can be drawn in every set', () => {
    for (const set of SETS) {
      const pieces = piecesFor(set)
      for (const kind of MAKRUK_KINDS) {
        expect(pieces['w' + kind]).toBeTypeOf('function')
        expect(pieces['b' + kind]).toBeTypeOf('function')
      }
    }
    // เบี้ยหงายวาดกลับหัว เบี้ยคว่ำไม่กลับ
    const text = (kind: string) => piecesFor(SETS[0])['w' + kind]().props.children[0].props.transform
    expect(text('F')).toContain('rotate(180')
    expect(text('P')).toBeUndefined()
  })
})

describe('makruk rules page', () => {
  const count = (kind: Parameters<typeof reach>[0], want: 'dot' | 'ring') => {
    let n = 0
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (reach(kind, dr, dc, 'makruk') === want) n++
    return n
  }

  test('each makruk piece reaches the right squares', () => {
    expect(count('M', 'dot')).toBe(4)
    expect(count('F', 'dot')).toBe(4)
    expect(count('S', 'dot')).toBe(5)
    expect(reach('S', -1, 0, 'makruk')).toBe('dot')
    expect(reach('S', 1, 0, 'makruk')).toBe('') // โคนถอยตรงไม่ได้
    expect(count('P', 'dot')).toBe(1) // ไม่มีการเดิน 2 ช่อง
    expect(count('P', 'ring')).toBe(2)
    expect(reach('P', -2, 0, 'chess')).toBe('dot')
  })

  test('the rules list the seven makruk pieces and explain counting', () => {
    expect(RULES.makruk.pieces.map((p) => p.kind)).toEqual(MAKRUK_KINDS)
    expect(RULES.makruk.specials.some((s) => s.title === 'นับศักดิ์หมาก')).toBe(true)
    expect(RULES.chess.pieces).toHaveLength(6)
  })
})

describe('makruk text', () => {
  test('the count is shown only while playing', () => {
    expect(countText(state())).toBe('')
    expect(countText(state({ count: { kind: 'board', n: 12, limit: 64 } }))).toBe('นับศักดิ์กระดาน 12/64')
    expect(countText(state({ count: { kind: 'pieces', n: 6, limit: 16, side: 'b' } }))).toBe(
      'นับศักดิ์หมาก 6/16 (ฝ่ายดำนับ)',
    )
    expect(countText(state({ status: 'finished', count: { kind: 'board', n: 12, limit: 64 } }))).toBe('')
  })

  test('a draw by counting is explained', () => {
    const parts = resultParts(state({ status: 'finished', result: '1/2-1/2', reason: 'count' }))
    expect(parts).toMatchObject({ headline: 'เสมอ', reason: 'นับศักดิ์ครบ', outcome: 'draw' })
  })
})

describe('makruk wording', () => {
  test('a makruk checkmate is called by its Thai name, a chess one keeps its own', () => {
    const done = (game: 'makruk' | 'chess') =>
      resultParts(state({ game, status: 'finished', result: '1-0', reason: 'checkmate' })).reason
    expect(done('makruk')).toBe('รุกจน')
    expect(done('chess')).toBe('รุกฆาต')
  })
})

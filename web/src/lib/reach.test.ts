import { describe, expect, test } from 'vitest'
import { lineEnds, reachOf } from './moves'
import { halfOf, isDarkSquare, setById, sideSets } from './pieceSets'
import type { StateMsg } from './protocol'
import { rematchView } from './text'

function state(patch: Partial<StateMsg> = {}): StateMsg {
  return {
    type: 'state',
    room: 'K7Q2XM',
    status: 'playing',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    turn: 'w',
    ply: 0,
    you: { role: 'player', color: 'w' },
    tc: '10+0',
    clock: { w: 600_000, b: 600_000, running: 'w' },
    ...patch,
  }
}

const sorted = (list: string[]) => [...list].sort()

describe('reach of a piece (highlights and hover lines)', () => {
  test('chess: the side to move gets its legal moves', () => {
    expect(sorted(reachOf(state(), 'g1').targets)).toEqual(['f3', 'h3'])
    expect(reachOf(state(), 'e4').targets).toEqual([]) // ช่องว่าง
  })

  test('chess: a piece of the side that is not to move also has a reach', () => {
    // ขาวถึงตา ชี้ที่ม้าดำ
    expect(sorted(reachOf(state(), 'b8').targets)).toEqual(['a6', 'c6'])
  })

  test('chess: captures are marked, and the victim is the square that is taken', () => {
    const s = state({ fen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2', ply: 2 })
    const pawn = reachOf(s, 'e4')
    expect(sorted(pawn.targets)).toEqual(['d5', 'e5'])
    expect(pawn.captures).toEqual(['d5'])
    expect(pawn.victims).toEqual(['d5'])
    // ชี้ที่เบี้ยดำ (ยังไม่ถึงตา): เห็นว่าเบี้ย e4 ของเราจะโดนกิน
    expect(reachOf(s, 'd5').victims).toEqual(['e4'])
  })

  test('chess: en passant captures a pawn that is not on the target square', () => {
    const s = state({ fen: 'rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3', turn: 'b', ply: 5 })
    const pawn = reachOf(s, 'd4')
    expect(pawn.captures).toEqual(['e3'])
    expect(pawn.victims).toEqual(['e4'])
  })

  test('chess: a capturing promotion still counts as a capture', () => {
    const s = state({ fen: '1r5k/P7/8/8/8/8/8/K7 w - - 0 1' })
    const pawn = reachOf(s, 'a7')
    expect(sorted(pawn.targets)).toEqual(['a8', 'b8'])
    expect(pawn.captures).toEqual(['b8'])
  })

  test('nothing is shown once the game is over', () => {
    expect(reachOf(state({ status: 'finished' }), 'g1').targets).toEqual([])
  })

  test('other games use legal for the side to move and reach for the other side', () => {
    const s = state({
      game: 'checkers',
      fen: '8/8/1c6/4c3/3C4/8/8/6C1 w',
      legal: { d4: ['f6'] },
      reach: { e5: ['c3'] },
    })
    // หมากฮอส: หมากที่ถูกกินอยู่ระหว่างทาง ไม่ใช่ช่องปลายทาง
    expect(reachOf(s, 'd4')).toEqual({ targets: ['f6'], captures: ['f6'], victims: ['e5'] })
    expect(reachOf(s, 'e5')).toEqual({ targets: ['c3'], captures: ['c3'], victims: ['d4'] })
    expect(reachOf(s, 'b6').targets).toEqual([])
  })

  test('neeb: every piece that would be sandwiched is a victim', () => {
    const s = state({ game: 'neeb', fen: '8/8/8/8/8/8/1ooO4/O7 w', legal: { a1: ['a2'] } })
    expect(reachOf(s, 'a1')).toEqual({ targets: ['a2'], captures: ['a2'], victims: ['b2', 'c2'] })
  })

  test('one line per direction, ending on the farthest square', () => {
    expect(sorted(lineEnds('a1', ['a2', 'a3', 'a4', 'b1', 'c1']))).toEqual(['a4', 'c1'])
    // ม้า: ทุกช่องอยู่คนละทิศ จึงได้เส้นละช่อง
    expect(sorted(lineEnds('g1', ['f3', 'h3', 'e2']))).toEqual(['e2', 'f3', 'h3'])
    expect(lineEnds('d4', [])).toEqual([])
  })
})

describe('the board is split between the two players\' sets', () => {
  test('each side uses the set its player picked, or the viewer\'s own when none was picked', () => {
    const local = setById('sky')
    const sets = sideSets(local, { w: { set: 'cocoa' }, b: {} })
    expect(sets.w.id).toBe('cocoa')
    expect(sets.b.id).toBe('sky')
    expect(sideSets(local, undefined)).toEqual({ w: local, b: local })
    // รหัสที่หน้าเว็บรุ่นนี้ไม่รู้จัก: ใช้ชุดของผู้ดู
    expect(sideSets(local, { w: { set: 'not-a-set' } }).w.id).toBe('sky')
  })

  test('ranks 1-4 belong to white, 5-8 to black, and a1 is a dark square', () => {
    expect(halfOf('a1')).toBe('w')
    expect(halfOf('h4')).toBe('w')
    expect(halfOf('a5')).toBe('b')
    expect(halfOf('h8')).toBe('b')
    expect(isDarkSquare('a1')).toBe(true)
    expect(isDarkSquare('h1')).toBe(false)
    expect(isDarkSquare('h8')).toBe(true)
  })
})

describe('rematch after the game', () => {
  const done = (patch: Partial<StateMsg> = {}) => state({ status: 'finished', result: '1-0', reason: 'resign', ...patch })

  test('a player can ask, and sees who is waiting for whom', () => {
    expect(rematchView(done())).toMatchObject({ canAsk: true, asked: false, opponentAsked: false, button: 'เล่นต่อ' })
    expect(rematchView(done({ rematch: ['w'] }))).toMatchObject({ asked: true, opponentAsked: false, button: 'รอคู่แข่งกดเล่นต่อ…' })
    const waited = rematchView(done({ rematch: ['b'] }))
    expect(waited).toMatchObject({ asked: false, opponentAsked: true, button: 'เล่นต่อ' })
    expect(waited.note).toContain('คู่แข่งอยากเล่นต่อ')
  })

  test('when the opponent has left the room the player is told, whether or not they asked first', () => {
    const players = { w: { connected: true }, b: { connected: false } }
    for (const votes of [[], ['w']] as const) {
      const view = rematchView(done({ players, rematch: [...votes] }))
      expect(view).toMatchObject({ opponentLeft: true, button: 'คู่แข่งออกไปแล้ว' })
      expect(view.note).toContain('คู่แข่งออกจากห้องไปแล้ว')
    }
    // กลับเข้ามาแล้ว: ขอเล่นต่อได้ตามปกติ
    const back = rematchView(done({ players: { w: { connected: true }, b: { connected: true } } }))
    expect(back).toMatchObject({ opponentLeft: false, button: 'เล่นต่อ' })
  })

  test('a spectator cannot ask but is told that a player did', () => {
    const watch = { role: 'spectator', color: '' } as const
    expect(rematchView(done({ you: watch }))).toMatchObject({ canAsk: false, note: '' })
    expect(rematchView(done({ you: watch, rematch: ['b'] })).note).toBe('ฝ่ายดำขอเล่นต่อ รออีกฝ่ายตอบ')
  })

  test('there is nothing to ask while the game is still on', () => {
    expect(rematchView(state())).toMatchObject({ canAsk: false, button: '', note: '' })
  })
})

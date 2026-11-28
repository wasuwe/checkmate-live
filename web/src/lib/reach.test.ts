import { describe, expect, test } from 'vitest'
import { reachOf } from './moves'
import { halfOf, isDarkSquare, setById, sideSets } from './pieceSets'
import { DOOR_GAP_MS, doorShouldRing, newDoorMemory, SAME_PERSON_MS } from './presence'
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

describe('reach of a piece (square highlights when picked or hovered)', () => {
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
    expect(rematchView(done({ rematch: ['w'] }))).toMatchObject({ asked: true, opponentAsked: false, button: 'รอคู่แข่ง…' })
    const waited = rematchView(done({ rematch: ['b'] }))
    expect(waited).toMatchObject({ asked: false, opponentAsked: true, button: 'เล่นต่อ' })
    expect(waited.note).toContain('คู่แข่งชวนเล่นต่อ')
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

describe('door bell when someone enters the room', () => {
  const seat = (you: boolean, connected = true) => ({ you, connected, ready: false })
  const lobby = (others: number, watching = 0) =>
    state({
      status: 'waiting',
      lobby: { seats: [seat(true), ...Array.from({ length: others }, () => seat(false))] },
      watching,
    })
  const MINUTE = 60_000

  test('rings when the opponent sits down and when a spectator comes in', () => {
    const memory = newDoorMemory()
    expect(doorShouldRing(lobby(0), lobby(1), memory, 0)).toBe(true)
    expect(doorShouldRing(lobby(1), lobby(1, 1), memory, MINUTE)).toBe(true)
    expect(doorShouldRing(lobby(1, 1), lobby(1, 2), memory, 2 * MINUTE)).toBe(true)
  })

  test('does not ring for our own arrival, for people leaving, or when nothing changed', () => {
    const memory = newDoorMemory()
    expect(doorShouldRing(null, lobby(1, 3), memory, 0)).toBe(false)
    expect(doorShouldRing(lobby(1, 1), lobby(1, 0), memory, 0)).toBe(false)
    expect(doorShouldRing(lobby(1), lobby(1), memory, MINUTE)).toBe(false)
  })

  test('does not ring when the same people only change places', () => {
    const memory = newDoorMemory()
    const playing = state({ players: { w: { connected: true }, b: { connected: true } }, watching: 1 })
    // ห้องรอกลายเป็นเกม
    expect(doorShouldRing(lobby(1, 1), playing, memory, 0)).toBe(false)
    // คนที่ถูกเชิญออกจากที่นั่งกลายเป็นผู้ชม
    expect(doorShouldRing(lobby(1, 0), lobby(0, 1), memory, 0)).toBe(false)
  })

  // กันเสียงดังซ้ำไปเรื่อย ๆ: คนที่เน็ตไม่นิ่งหลุดแล้วต่อกลับทุกไม่กี่วินาที
  test('does not ring again and again for someone whose connection keeps dropping', () => {
    const memory = newDoorMemory()
    const away = state({ players: { w: { connected: true }, b: { connected: false } } })
    const back = state({ players: { w: { connected: true }, b: { connected: true } } })
    let rings = 0
    for (let i = 0; i < 30; i++) {
      const t = i * 8000 // หลุดและกลับทุก 8 วินาที เป็นเวลา 4 นาที
      doorShouldRing(back, away, memory, t)
      if (doorShouldRing(away, back, memory, t + 3000)) rings++
    }
    expect(rings).toBe(0)
  })

  test('a spectator reloading the page does not ring, a new one later does', () => {
    const memory = newDoorMemory()
    expect(doorShouldRing(lobby(1, 0), lobby(1, 1), memory, 0)).toBe(true)
    // โหลดหน้าใหม่: ออกแล้วกลับเข้ามาในหนึ่งวินาที
    expect(doorShouldRing(lobby(1, 1), lobby(1, 0), memory, MINUTE)).toBe(false)
    expect(doorShouldRing(lobby(1, 0), lobby(1, 1), memory, MINUTE + 1000)).toBe(false)
    // อีกคนเข้ามาทีหลังนานพอ
    expect(doorShouldRing(lobby(1, 1), lobby(1, 2), memory, MINUTE + SAME_PERSON_MS + 1000)).toBe(true)
  })

  test('two people arriving at almost the same moment ring once', () => {
    const memory = newDoorMemory()
    expect(doorShouldRing(lobby(1, 0), lobby(1, 1), memory, 0)).toBe(true)
    expect(doorShouldRing(lobby(1, 1), lobby(1, 2), memory, DOOR_GAP_MS - 1)).toBe(false)
    expect(doorShouldRing(lobby(1, 2), lobby(1, 3), memory, DOOR_GAP_MS + 1)).toBe(true)
  })
})

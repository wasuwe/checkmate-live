import { describe, expect, test } from 'vitest'
import { applyMove, checkedKingSquare, isPromotion, legalTargets, pieceColor } from './moves'
import {
  clockAt,
  DEFAULT_TIME_CONTROL,
  describeTimeControl,
  formatClock,
  TIME_CONTROLS,
} from './clock'
import { absences } from './presence'
import { extractRoomId, isRoomId, parseServerMsg, type StateMsg } from './protocol'
import { parseRoute, roomPath } from './router'
import { errorText, resultText, statusText } from './text'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const PROMO = '8/P6k/8/8/8/8/8/K7 w - - 0 1'

describe('moves', () => {
  test('legalTargets lists squares a piece can reach', () => {
    expect(legalTargets(START, 'e2').sort()).toEqual(['e3', 'e4'])
    expect(legalTargets(START, 'g1').sort()).toEqual(['f3', 'h3'])
    expect(legalTargets(START, 'e7')).toEqual([]) // ไม่ใช่ตาของดำ
    expect(legalTargets(START, 'e4')).toEqual([]) // ช่องว่าง
  })

  test('legalTargets deduplicates promotion moves', () => {
    expect(legalTargets(PROMO, 'a7')).toEqual(['a8'])
  })

  test('helpers tolerate bad input', () => {
    expect(legalTargets('garbage', 'e2')).toEqual([])
    expect(legalTargets(START, 'z9')).toEqual([])
    expect(applyMove('garbage', 'e2', 'e4', '')).toBeNull()
    expect(isPromotion('garbage', 'a7', 'a8')).toBe(false)
    expect(checkedKingSquare('garbage')).toBeNull()
  })

  test('isPromotion detects pawn promotion only', () => {
    expect(isPromotion(PROMO, 'a7', 'a8')).toBe(true)
    expect(isPromotion(PROMO, 'a1', 'b1')).toBe(false)
    expect(isPromotion(START, 'e2', 'e4')).toBe(false)
  })

  test('applyMove returns the next position or null', () => {
    expect(applyMove(START, 'e2', 'e4', '')).toMatch(/^rnbqkbnr\/pppppppp\/8\/8\/4P3\/8\/PPPP1PPP\/RNBQKBNR b/)
    expect(applyMove(START, 'e2', 'e5', '')).toBeNull()
    expect(applyMove(PROMO, 'a7', 'a8', 'n')).toMatch(/^N7\/7k/)
  })

  test('checkedKingSquare finds the king in check', () => {
    // หลัง fool's mate ขาวถูกรุก
    expect(checkedKingSquare('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')).toBe('e1')
    expect(checkedKingSquare(START)).toBeNull()
  })

  test('pieceColor reads the board library piece code', () => {
    expect(pieceColor('wP')).toBe('w')
    expect(pieceColor('bK')).toBe('b')
    expect(pieceColor('')).toBeNull()
  })
})

describe('protocol', () => {
  test('parseServerMsg accepts known types only', () => {
    expect(parseServerMsg('{"type":"error","code":"x"}')).toEqual({ type: 'error', code: 'x' })
    expect(parseServerMsg('{"type":"nope"}')).toBeNull()
    expect(parseServerMsg('[]')).toBeNull()
    expect(parseServerMsg('null')).toBeNull()
    expect(parseServerMsg('oops')).toBeNull()
  })

  test('extractRoomId reads a bare code or a pasted link', () => {
    expect(extractRoomId('abcdefghjkmn')).toBe('abcdefghjkmn')
    expect(extractRoomId('  ABCDEFGHJKMN ')).toBe('abcdefghjkmn')
    expect(extractRoomId('https://chess.example.com/room/abcdefghjkmn')).toBe('abcdefghjkmn')
    expect(extractRoomId('http://localhost:5173/room/abcdefghjkmn/')).toBe('abcdefghjkmn')
    expect(extractRoomId('abc')).toBeNull()
    expect(extractRoomId('abcdefghjkmnp')).toBeNull() // 13 ตัว
    expect(extractRoomId('')).toBeNull()
  })

  test('isRoomId rejects ambiguous characters', () => {
    expect(isRoomId('abcdefghjkmn')).toBe(true)
    expect(isRoomId('abcdefghjk10')).toBe(false)
  })
})

describe('router', () => {
  test('parseRoute', () => {
    expect(parseRoute('/')).toEqual({ page: 'home' })
    expect(parseRoute('/room/abcdefghjkmn')).toEqual({ page: 'room', roomId: 'abcdefghjkmn' })
    expect(parseRoute('/room/abcdefghjkmn/')).toEqual({ page: 'room', roomId: 'abcdefghjkmn' })
    expect(parseRoute('/room/short')).toEqual({ page: 'not_found' })
    expect(parseRoute('/elsewhere')).toEqual({ page: 'not_found' })
    expect(parseRoute(roomPath('abcdefghjkmn'))).toEqual({ page: 'room', roomId: 'abcdefghjkmn' })
  })
})

describe('clock', () => {
  const base: StateMsg = {
    type: 'state',
    room: 'abcdefghjkmn',
    status: 'playing',
    fen: START,
    turn: 'w',
    ply: 0,
    you: { role: 'player', color: 'w' },
    tc: '5+3',
    clock: { w: 300_000, b: 280_000, running: 'w' },
  }

  test('only the running side counts down', () => {
    expect(clockAt(base, 1000, 1000)).toEqual({ w: 300_000, b: 280_000 })
    expect(clockAt(base, 1000, 31_000)).toEqual({ w: 270_000, b: 280_000 })
    const blackToMove: StateMsg = { ...base, clock: { ...base.clock, running: 'b' } }
    expect(clockAt(blackToMove, 1000, 31_000)).toEqual({ w: 300_000, b: 250_000 })
  })

  test('a stopped clock does not move, and time never goes negative or backwards', () => {
    const stopped: StateMsg = { ...base, clock: { ...base.clock, running: '' } }
    expect(clockAt(stopped, 0, 999_999)).toEqual({ w: 300_000, b: 280_000 })
    expect(clockAt(base, 0, 999_999).w).toBe(0)
    expect(clockAt(base, 5000, 1000).w).toBe(300_000)
  })

  test('formatClock', () => {
    expect(formatClock(600_000)).toBe('10:00')
    expect(formatClock(599_001)).toBe('10:00')
    expect(formatClock(599_000)).toBe('9:59')
    expect(formatClock(61_000)).toBe('1:01')
    expect(formatClock(10_000)).toBe('0:10')
    expect(formatClock(9_999)).toBe('0:09.9')
    expect(formatClock(9_400)).toBe('0:09.4')
    expect(formatClock(100)).toBe('0:00.1')
    expect(formatClock(0)).toBe('0:00.0')
    expect(formatClock(-50)).toBe('0:00.0')
    expect(formatClock(3_600_000)).toBe('60:00')
  })

  test('describeTimeControl', () => {
    expect(describeTimeControl('10+0')).toBe('10 นาที')
    expect(describeTimeControl('5+3')).toBe('5 นาที +3 วินาทีต่อตา')
    expect(describeTimeControl('weird')).toBe('weird')
  })

  test('every offered time control is one the server accepts', () => {
    for (const tc of TIME_CONTROLS) {
      const match = /^(\d{1,2})\+(\d{1,2})$/.exec(tc.value)
      expect(match, tc.value).not.toBeNull()
      const [minutes, increment] = [Number(match![1]), Number(match![2])]
      expect(minutes >= 1 && minutes <= 60 && increment <= 60, tc.value).toBe(true)
    }
    expect(TIME_CONTROLS.map((tc) => tc.value)).toContain(DEFAULT_TIME_CONTROL)
  })
})

describe('presence', () => {
  const playing: StateMsg = {
    type: 'state',
    room: 'abcdefghjkmn',
    status: 'playing',
    fen: START,
    turn: 'w',
    ply: 0,
    you: { role: 'player', color: 'w' },
    tc: '10+0',
    clock: { w: 600000, b: 600000, running: 'w' },
    players: { w: { connected: true }, b: { connected: false, graceLeft: 60 } },
  }

  test('lists disconnected players and counts down from the server value', () => {
    expect(absences(playing, 1000, 1000)).toEqual([{ color: 'b', secondsLeft: 60 }])
    expect(absences(playing, 1000, 1999)).toEqual([{ color: 'b', secondsLeft: 60 }])
    expect(absences(playing, 1000, 11_000)).toEqual([{ color: 'b', secondsLeft: 50 }])
  })

  test('never goes below zero or back in time', () => {
    expect(absences(playing, 1000, 999_000)).toEqual([{ color: 'b', secondsLeft: 0 }])
    expect(absences(playing, 5000, 1000)).toEqual([{ color: 'b', secondsLeft: 60 }])
  })

  test('is empty when everyone is connected or the game is not running', () => {
    const allHere: StateMsg = { ...playing, players: { w: { connected: true }, b: { connected: true } } }
    expect(absences(allHere, 0, 0)).toEqual([])
    expect(absences({ ...playing, status: 'finished' }, 0, 0)).toEqual([])
    expect(absences({ ...playing, status: 'waiting', players: undefined }, 0, 0)).toEqual([])
  })
})

describe('text', () => {
  const base: StateMsg = {
    type: 'state',
    room: 'abcdefghjkmn',
    status: 'playing',
    fen: START,
    turn: 'w',
    ply: 0,
    you: { role: 'player', color: 'w' },
    tc: '10+0',
    clock: { w: 600000, b: 600000, running: 'w' },
  }

  test('statusText while playing depends on whose turn it is', () => {
    expect(statusText(base)).toBe('ตาคุณเดิน')
    expect(statusText({ ...base, turn: 'b' })).toBe('รอคู่แข่งเดิน')
    expect(statusText({ ...base, you: { role: 'spectator', color: '' } })).toBe('ตาของขาว')
    expect(statusText({ ...base, status: 'waiting' })).toBe('รอคู่แข่งเข้าห้อง')
  })

  test('resultText is written from the viewer’s side', () => {
    const over: StateMsg = { ...base, status: 'finished', result: '0-1', reason: 'checkmate' }
    expect(resultText(over)).toBe('คุณแพ้ — รุกจน')
    expect(resultText({ ...over, you: { role: 'player', color: 'b' } })).toBe('คุณชนะ — รุกจน')
    expect(resultText({ ...over, you: { role: 'spectator', color: '' } })).toBe('ดำชนะ — รุกจน')
    expect(resultText({ ...over, result: '1/2-1/2', reason: 'stalemate' })).toBe('เสมอ — อับ (stalemate)')
    expect(statusText(over)).toBe('คุณแพ้ — รุกจน')
    expect(resultText({ ...over, result: '1-0', reason: 'resign' })).toBe('คุณชนะ — ยอมแพ้')
    expect(resultText({ ...over, result: '1-0', reason: 'abandon' })).toBe('คุณชนะ — หลุดจากเกมเกินเวลา')
  })

  test('errorText falls back for unknown codes', () => {
    expect(errorText('illegal_move')).toBe('เดินแบบนี้ไม่ได้')
    expect(errorText('???')).toBe('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง')
  })
})

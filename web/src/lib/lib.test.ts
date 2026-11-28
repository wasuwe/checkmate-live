import { describe, expect, test } from 'vitest'
import { applyMove, checkedKingSquare, isPromotion, legalTargets, pieceColor } from './moves'
import {
  clockAt,
  DEFAULT_TIME_CONTROL,
  describeTimeControl,
  formatClock,
  isUntimed,
  NO_TIME,
  TIME_CONTROLS,
} from './clock'
import { absences } from './presence'
import { extractRoomId, isRoomId, parseServerMsg, type StateMsg } from './protocol'
import { parseRoute, roomPath } from './router'
import { centerSquare } from './profile'
import { errorText, playerName, resultParts, resultText, statusText } from './text'
import { becameMyTurn } from './turnAlert'

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
    expect(extractRoomId('482915')).toBe('482915')
    expect(extractRoomId('  482915 ')).toBe('482915')
    expect(extractRoomId('https://chess.example.com/room/482915')).toBe('482915')
    expect(extractRoomId('http://localhost:5173/room/482915/')).toBe('482915')
    // ตัวเลขอื่นในลิงก์ (เช่น เลขพอร์ต) ไม่ถูกเข้าใจผิดว่าเป็นรหัสห้อง
    expect(extractRoomId('http://localhost:517300/room/482915')).toBe('482915')
    expect(extractRoomId('http://192.168.100.200:8080/room/482915?x=1')).toBe('482915')
    // รหัสที่บอกต่อกันแบบมีช่องว่างหรือขีดคั่น
    expect(extractRoomId('482 915')).toBe('482915')
    expect(extractRoomId('482-915')).toBe('482915')
    expect(extractRoomId('รหัสห้อง 482915 นะ')).toBe('482915')
    expect(extractRoomId('abc')).toBeNull()
    expect(extractRoomId('4829150')).toBeNull() // 7 หลัก
    expect(extractRoomId('48291')).toBeNull() // 5 หลัก
    expect(extractRoomId('082915')).toBeNull() // ขึ้นต้นด้วย 0 ไม่ใช่รหัสที่ระบบออกให้
    expect(extractRoomId('')).toBeNull()
  })

  test('isRoomId accepts only six digits that do not start with zero', () => {
    expect(isRoomId('482915')).toBe(true)
    expect(isRoomId('100000')).toBe(true)
    expect(isRoomId('999999')).toBe(true)
    for (const bad of ['48291', '4829150', '082915', '48291a', '482 915', 'abcdefghjkmn', '']) expect(isRoomId(bad), bad).toBe(false)
  })
})

describe('router', () => {
  test('parseRoute', () => {
    expect(parseRoute('/')).toEqual({ page: 'home' })
    expect(parseRoute('/room/482915')).toEqual({ page: 'room', roomId: '482915' })
    expect(parseRoute('/room/482915/')).toEqual({ page: 'room', roomId: '482915' })
    expect(parseRoute('/room/short')).toEqual({ page: 'not_found' })
    expect(parseRoute('/room/abcdefghjkmn')).toEqual({ page: 'not_found' }) // รหัสรูปแบบเก่า
    expect(parseRoute('/elsewhere')).toEqual({ page: 'not_found' })
    expect(parseRoute(roomPath('482915'))).toEqual({ page: 'room', roomId: '482915' })
  })
})

describe('clock', () => {
  const base: StateMsg = {
    type: 'state',
    room: '482915',
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
    expect(describeTimeControl('10+0')).toBe('ฝ่ายละ 10 นาที')
    expect(describeTimeControl('5+3')).toBe('ฝ่ายละ 5 นาที เพิ่มตาละ 3 วินาที')
    expect(describeTimeControl('weird')).toBe('weird')
    expect(describeTimeControl(NO_TIME)).toBe('ไม่จับเวลา')
    expect(isUntimed(NO_TIME)).toBe(true)
    expect(isUntimed('10+0')).toBe(false)
  })

  test('every offered time control is one the server accepts', () => {
    // "none" = ไม่จับเวลา (hub.NoTimeControl ฝั่งเซิร์ฟเวอร์)
    expect(TIME_CONTROLS.map((tc) => tc.value)).toContain(NO_TIME)
    for (const tc of TIME_CONTROLS.filter((t) => t.value !== NO_TIME)) {
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
    room: '482915',
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
    room: '482915',
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
    expect(statusText({ ...base, you: { role: 'spectator', color: '' } })).toBe('ตาฝ่ายขาวเดิน')
    expect(statusText({ ...base, status: 'waiting' })).toBe('รอคู่แข่งเข้าห้อง')
  })

  test('resultText is written from the viewer’s side', () => {
    const over: StateMsg = { ...base, status: 'finished', result: '0-1', reason: 'checkmate' }
    const asBlack = { role: 'player', color: 'b' } as const
    const watching = { role: 'spectator', color: '' } as const
    expect(resultText(over)).toBe('คุณแพ้เพราะโดน Checkmate')
    expect(resultText({ ...over, you: asBlack })).toBe('คุณชนะด้วย Checkmate')
    expect(resultText({ ...over, you: watching })).toBe('ฝ่ายดำชนะด้วย Checkmate')
    expect(resultText({ ...over, result: '1/2-1/2', reason: 'stalemate' })).toBe('เสมอเพราะอับ')
    expect(resultText({ ...over, result: '1/2-1/2', reason: 'draw' })).toBe('เสมอตามกติกา')
    expect(statusText(over)).toBe('คุณแพ้เพราะโดน Checkmate')
    // เหตุผลบอกว่าใครเป็นคนทำ: ฝ่ายขาว (ผู้ดูในชุดทดสอบนี้) ชนะเพราะคู่แข่งยอมแพ้ หลุด หรือหมดเวลา
    expect(resultText({ ...over, result: '1-0', reason: 'resign' })).toBe('คุณชนะเพราะคู่แข่งยอมแพ้')
    expect(resultText({ ...over, result: '1-0', reason: 'abandon' })).toBe('คุณชนะเพราะคู่แข่งหลุดจากเกมนานเกินไป')
    expect(resultText({ ...over, result: '1-0', reason: 'timeout' })).toBe('คุณชนะเพราะคู่แข่งหมดเวลา')
    expect(resultText({ ...over, reason: 'resign' })).toBe('คุณยอมแพ้')
    expect(resultText({ ...over, reason: 'timeout' })).toBe('คุณแพ้เพราะหมดเวลา')
    expect(resultText({ ...over, reason: 'wipeout' })).toBe('คุณแพ้เพราะหมากถูกกินหมด')
    expect(resultText({ ...over, reason: 'resign', you: watching })).toBe('ฝ่ายดำชนะเพราะฝ่ายขาวยอมแพ้')
    expect(resultParts({ ...over, reason: 'resign' })).toMatchObject({ headline: 'คุณแพ้', reason: 'คุณยอมแพ้' })
    expect(resultParts({ ...over, reason: 'timeout' })).toMatchObject({ headline: 'คุณแพ้', reason: 'คุณหมดเวลา' })
    expect(resultParts({ ...over, result: '1/2-1/2', reason: 'draw' })).toMatchObject({ headline: 'เสมอ', reason: 'ตามกติกา' })
    // ไม่มีขีดยาวหรือจุดคั่นในข้อความผลเกม
    for (const reason of ['checkmate', 'resign', 'timeout', 'abandon', 'blocked', 'wipeout', 'draw', 'count', 'stalemate']) {
      for (const result of ['1-0', '0-1', '1/2-1/2']) {
        for (const you of [over.you, asBlack, watching]) {
          expect(resultText({ ...over, result, reason, you })).not.toMatch(/[—–·]/)
        }
      }
    }
  })

  test('errorText falls back for unknown codes', () => {
    expect(errorText('illegal_move')).toBe('เดินแบบนี้ไม่ได้')
    expect(errorText('???')).toBe('มีบางอย่างผิดพลาด ลองใหม่อีกครั้ง')
  })
})

describe('player names', () => {
  test('profile name wins, otherwise the kind of player is shown', () => {
    expect(playerName({ connected: true, name: 'Alice' }, 'w')).toBe('Alice')
    expect(playerName({ connected: true, guest: true }, 'w')).toBe('ผู้เล่นรับเชิญ')
    expect(playerName({ connected: true }, 'b')).toBe('ผู้เล่น')
    expect(playerName(undefined, 'b')).toBe('ดำ')
  })
})

describe('avatar crop', () => {
  test('takes the largest centred square', () => {
    expect(centerSquare(600, 400)).toEqual({ x: 100, y: 0, side: 400 })
    expect(centerSquare(300, 900)).toEqual({ x: 0, y: 300, side: 300 })
    expect(centerSquare(256, 256)).toEqual({ x: 0, y: 0, side: 256 })
  })
})

describe('turn alert', () => {
  const base = (patch: Partial<StateMsg>): StateMsg => ({
    type: 'state',
    room: '482915',
    status: 'playing',
    fen: '8/8/8/8/8/8/8/8 w',
    turn: 'w',
    ply: 0,
    you: { role: 'player', color: 'w' },
    tc: '10+0',
    clock: { w: 1, b: 1, running: 'w' },
    ...patch,
  })

  test('fires when the turn passes to me, not on my own move or a checkers chain', () => {
    expect(becameMyTurn(base({ turn: 'b', ply: 3 }), base({ turn: 'w', ply: 4 }))).toBe(true)
    expect(becameMyTurn(base({ turn: 'w', ply: 4 }), base({ turn: 'b', ply: 5 }))).toBe(false)
    // กินต่อ: ตายังเป็นของเราเหมือนเดิม
    expect(becameMyTurn(base({ turn: 'w', ply: 4 }), base({ turn: 'w', ply: 5 }))).toBe(false)
  })

  test('fires at the start when I move first, never after a reconnect or for spectators', () => {
    expect(becameMyTurn(base({ status: 'waiting', turn: 'w' }), base({ turn: 'w' }))).toBe(true)
    expect(becameMyTurn(null, base({ turn: 'w', ply: 6 }))).toBe(false)
    const spectator = { role: 'spectator' as const, color: '' as const }
    expect(becameMyTurn(base({ turn: 'b', ply: 3, you: spectator }), base({ turn: 'w', ply: 4, you: spectator }))).toBe(false)
    expect(becameMyTurn(base({ turn: 'b', ply: 3 }), base({ turn: 'w', ply: 4, status: 'finished' }))).toBe(false)
  })
})

describe('mixed letter and number room codes', () => {
  test('six letters and digits without look-alikes, with at least one of each', () => {
    for (const ok of ['K7Q2XM', 'AB2CD3', '2ABCDE', '482915']) expect(isRoomId(ok), ok).toBe(true)
    // ตัวที่สับสนง่าย ตัวเล็ก ตัวอักษรล้วน ความยาวผิด
    for (const bad of ['K7Q2X0', 'K7Q2XO', 'K7Q2X1', 'K7Q2XI', 'K7Q2XL', 'k7q2xm', 'ABCDEF', 'K7Q2X', 'K7Q2XMM', '']) {
      expect(isRoomId(bad), bad).toBe(false)
    }
  })

  test('codes are read in any letter case, with spaces, or from a link or a sentence', () => {
    expect(extractRoomId('k7q2xm')).toBe('K7Q2XM')
    expect(extractRoomId('K7Q 2XM')).toBe('K7Q2XM')
    expect(extractRoomId('k7q-2xm')).toBe('K7Q2XM')
    expect(extractRoomId('https://checkmate-live.fly.dev/room/K7Q2XM')).toBe('K7Q2XM')
    expect(extractRoomId('http://localhost:5173/room/k7q2xm?x=1')).toBe('K7Q2XM')
    expect(extractRoomId('ห้อง K7Q2XM นะ')).toBe('K7Q2XM')
    expect(extractRoomId('ห้อง K7Q 2XM นะ')).toBe('K7Q2XM')
    // คำภาษาอังกฤษ 6 ตัวทั่วไปไม่ถูกนับเป็นรหัส (ไม่มีตัวเลข)
    expect(extractRoomId('please play')).toBeNull()
  })

  test('a lower-case room link opens the same room', () => {
    expect(parseRoute('/room/k7q2xm')).toEqual({ page: 'room', roomId: 'K7Q2XM' })
    expect(parseRoute('/room/K7Q2X0')).toEqual({ page: 'not_found' })
  })
})

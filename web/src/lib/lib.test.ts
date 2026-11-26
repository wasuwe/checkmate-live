import { describe, expect, test } from 'vitest'
import { applyMove, checkedKingSquare, isPromotion, legalTargets, pieceColor } from './moves'
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

describe('text', () => {
  const base: StateMsg = {
    type: 'state',
    room: 'abcdefghjkmn',
    status: 'playing',
    fen: START,
    turn: 'w',
    ply: 0,
    you: { role: 'player', color: 'w' },
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
  })

  test('errorText falls back for unknown codes', () => {
    expect(errorText('illegal_move')).toBe('เดินแบบนี้ไม่ได้')
    expect(errorText('???')).toBe('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง')
  })
})

// test ของส่วนที่เพิ่มมากับหน้าตาใหม่: เอฟเฟกต์ กฎการเล่น ฟอร์มสมัคร เส้นทางหน้า และข้อความผลเกม
import { describe, expect, test } from 'vitest'
import { capturedSquares, cleanFx, DEFAULT_FX, fxEventFor, pieceCount, seeded, squarePosition } from './fx'
import type { StateMsg } from './protocol'
import { emailError, passwordChecks, passwordError, validateField, validateRegistration } from './registration'
import { parseRoute } from './router'
import { reach } from './rules'
import { TERMS } from './terms'
import { formatRoomCode, resultParts } from './text'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function state(patch: Partial<StateMsg> = {}): StateMsg {
  return {
    type: 'state',
    room: '482915',
    status: 'playing',
    fen: START,
    turn: 'w',
    ply: 0,
    you: { role: 'player', color: 'w' },
    tc: '10+0',
    clock: { w: 600000, b: 600000, running: 'w' },
    ...patch,
  }
}

describe('board effects', () => {
  test('counts pieces from a FEN', () => {
    expect(pieceCount(START)).toBe(32)
    expect(pieceCount('8/P6k/8/8/8/8/8/K7 w - - 0 1')).toBe(3)
  })

  test('nothing plays on the first state or when no move was made', () => {
    expect(fxEventFor(null, state({ ply: 5 }), null)).toBeNull()
    // ผู้เล่นหลุดหรือกลับมา: state ใหม่แต่ ply เท่าเดิม
    expect(fxEventFor(state({ ply: 5 }), state({ ply: 5 }), 'e1')).toBeNull()
    // reconnect แล้วข้ามไปหลายตา: ไม่เล่นย้อนหลัง
    expect(fxEventFor(state({ ply: 5 }), state({ ply: 8 }), 'e1')).toBeNull()
  })

  test('a quiet move plays nothing', () => {
    expect(fxEventFor(state(), state({ ply: 1, lastMove: { from: 'e2', to: 'e4' } }), null)).toBeNull()
  })

  test('a capture plays on the capture square', () => {
    const before = state({ ply: 2, fen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2' })
    const after = state({
      ply: 3,
      fen: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2',
      lastMove: { from: 'e4', to: 'd5' },
    })
    expect(fxEventFor(before, after, null)).toEqual({ kind: 'capture', square: 'd5', squares: ['d5'] })
  })

  test('the effect plays on the captured enemy piece, not on the landing square', () => {
    // หมากฮอส: ขาว c3 กระโดดข้าม d4 ไปลง e5 ตัวที่ถูกกินอยู่ที่ d4
    const jumpBefore = state({ ply: 4, turn: 'w', fen: '8/8/8/8/3c4/2C5/8/8 w' })
    const jumpAfter = state({ ply: 5, turn: 'b', fen: '8/8/8/4C3/8/8/8/8 b', lastMove: { from: 'c3', to: 'e5' } })
    expect(fxEventFor(jumpBefore, jumpAfter, null)).toEqual({ kind: 'capture', square: 'd4', squares: ['d4'] })
    // กินผ่าน (en passant): เบี้ยที่ถูกกินอยู่ที่ d5 ไม่ใช่ช่องที่ไปลง d6
    const epBefore = state({ ply: 4, turn: 'w', fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 3' })
    const epAfter = state({ ply: 5, turn: 'b', fen: '4k3/8/3P4/8/8/8/8/4K3 b - - 0 3', lastMove: { from: 'e5', to: 'd6' } })
    expect(capturedSquares(epBefore, epAfter)).toEqual(['d5'])
    // หมากหนีบ: กินสองตัวในตาเดียว เล่นที่ทั้งสองตัว
    const pinchBefore = state({ ply: 4, turn: 'w', fen: '8/8/8/1OooO3/8/5O2/8/8 w' })
    const pinchAfter = state({ ply: 5, turn: 'b', fen: '8/8/8/1O2O3/8/5O2/8/8 b', lastMove: { from: 'a5', to: 'b5' } })
    expect(capturedSquares(pinchBefore, pinchAfter)).toEqual(['c5', 'd5'])
    // การเดินธรรมดาและการเข้าป้อมไม่นับเป็นการกิน
    expect(capturedSquares(state(), state({ ply: 1, turn: 'b', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' }))).toEqual([])
  })

  test('check wins over capture, and checkmate wins over both', () => {
    const before = state({ ply: 2, fen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2' })
    const after = state({
      ply: 3,
      fen: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2',
      lastMove: { from: 'e4', to: 'd5' },
    })
    expect(fxEventFor(before, after, 'e8')).toEqual({ kind: 'check', square: 'e8' })
    // รุกจน: เล่นที่คิงของฝ่ายที่แพ้
    const mate = { ...after, turn: 'b' as const, status: 'finished' as const, result: '1-0', reason: 'checkmate' }
    expect(fxEventFor(before, mate, null)).toEqual({ kind: 'mate', square: 'e8' })
  })

  test('a game that ends another way plays no checkmate effect', () => {
    const resigned = state({ ply: 1, status: 'finished', result: '0-1', reason: 'resign' })
    expect(fxEventFor(state(), resigned, null)).toBeNull()
  })

  test('squares map to the right corner for each side of the board', () => {
    expect(squarePosition('a8', false)).toEqual({ left: 0, top: 0 })
    expect(squarePosition('h1', false)).toEqual({ left: 87.5, top: 87.5 })
    expect(squarePosition('e4', false)).toEqual({ left: 50, top: 50 })
    // กระดานหมุนเมื่อเล่นฝั่งดำ
    expect(squarePosition('a8', true)).toEqual({ left: 87.5, top: 87.5 })
    expect(squarePosition('h1', true)).toEqual({ left: 0, top: 0 })
  })

  test('stored effect choices are repaired', () => {
    expect(cleanFx(null)).toEqual(DEFAULT_FX)
    expect(cleanFx({ capture: 'hearts', check: 'nope', mate: 5 })).toEqual({ ...DEFAULT_FX, capture: 'hearts' })
    expect(cleanFx({ capture: 'none', check: 'none', mate: 'none' })).toEqual({ capture: 'none', check: 'none', mate: 'none' })
  })

  test('seeded randomness is stable and within range', () => {
    expect(seeded(3)).toBe(seeded(3))
    for (let i = 0; i < 50; i++) {
      expect(seeded(i)).toBeGreaterThanOrEqual(0)
      expect(seeded(i)).toBeLessThan(1)
    }
  })
})

describe('rule diagrams', () => {
  const count = (kind: Parameters<typeof reach>[0], want: 'dot' | 'ring') => {
    let n = 0
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (reach(kind, dr, dc) === want) n++
    return n
  }

  test('each piece reaches the right number of squares on a 5x5 board', () => {
    expect(count('K', 'dot')).toBe(8)
    expect(count('N', 'dot')).toBe(8)
    expect(count('R', 'dot')).toBe(8)
    expect(count('B', 'dot')).toBe(8)
    expect(count('Q', 'dot')).toBe(16)
    expect(count('P', 'dot')).toBe(2) // เดินหน้า 1 หรือ 2 ช่อง
    expect(count('P', 'ring')).toBe(2) // กินทแยงไปข้างหน้า
  })

  test('no piece reaches its own square, and pawns do not go backwards', () => {
    for (const kind of ['K', 'Q', 'R', 'B', 'N', 'P'] as const) expect(reach(kind, 0, 0)).toBe('')
    expect(reach('P', 1, 0)).toBe('')
    expect(reach('P', 1, 1)).toBe('')
  })
})

describe('registration form', () => {
  const ok = { name: 'ม้าน้อย', email: 'a@example.com', password: 'longenough1', confirm: 'longenough1' }

  test('valid input has no errors, and the name is optional', () => {
    expect(validateRegistration(ok)).toEqual({})
    expect(validateRegistration({ ...ok, name: '  ' })).toEqual({})
  })

  test('each field reports its own problem', () => {
    expect(Object.keys(validateRegistration({ ...ok, name: 'ab' }))).toEqual(['name'])
    expect(Object.keys(validateRegistration({ ...ok, name: 'x'.repeat(21) }))).toEqual(['name'])
    expect(Object.keys(validateRegistration({ ...ok, email: 'not-an-email' }))).toEqual(['email'])
    expect(Object.keys(validateRegistration({ ...ok, password: 'short', confirm: 'short' }))).toEqual(['password'])
    expect(Object.keys(validateRegistration({ ...ok, confirm: 'different' }))).toEqual(['confirm'])
    expect(Object.keys(validateRegistration({ name: 'ab', email: '', password: '', confirm: 'x' })).sort()).toEqual([
      'confirm',
      'email',
      'name',
      'password',
    ])
  })

  test('Thai names are measured in characters, not bytes', () => {
    expect(validateRegistration({ ...ok, name: 'กขค' })).toEqual({})
  })
})

describe('pages', () => {
  test('every page has a route', () => {
    for (const [path, page] of [
      ['/', 'home'],
      ['/play', 'play'],
      ['/login', 'login'],
      ['/register', 'register'],
      ['/terms', 'terms'],
      ['/rules', 'rules'],
      ['/profile', 'profile'],
      ['/profile/', 'profile'],
      ['/credits', 'credits'],
      ['/gallery', 'gallery'],
      ['/piece-studio', 'pieces'],
      ['/backstage', 'admin'],
      ['/backstage/members', 'members'],
      ['/admin', 'not_found'], // ชื่อที่เดาง่ายไม่ได้พาไปหน้าจัดการ
    ]) {
      expect(parseRoute(path).page, path).toBe(page)
    }
    expect(parseRoute('/room/482915')).toEqual({ page: 'room', roomId: '482915' })
    expect(parseRoute('/constructor').page).toBe('not_found')
    expect(parseRoute('/play/extra').page).toBe('not_found')
  })

  test('terms have five titled sections', () => {
    expect(TERMS).toHaveLength(5)
    for (const t of TERMS) expect(t.title.length > 0 && t.body.length > 20).toBe(true)
  })
})

describe('result popup', () => {
  test('describes the result from the viewer side', () => {
    const done = (patch: Partial<StateMsg>) => resultParts(state({ status: 'finished', ...patch }))
    expect(done({ result: '1-0', reason: 'checkmate' })).toMatchObject({ headline: 'คุณชนะ!', outcome: 'win' })
    expect(done({ result: '0-1', reason: 'timeout' })).toMatchObject({ headline: 'คุณแพ้', outcome: 'loss', reason: 'คุณหมดเวลา' })
    expect(done({ result: '1/2-1/2', reason: 'stalemate' })).toMatchObject({ headline: 'เสมอ', outcome: 'draw' })
    expect(done({ result: '0-1', reason: 'resign', you: { role: 'spectator', color: '' } })).toMatchObject({
      headline: 'ฝ่ายดำชนะ',
      outcome: 'watch',
      reason: 'ฝ่ายขาวยอมแพ้',
    })
  })

  test('room codes are shown as two groups of three', () => {
    expect(formatRoomCode('482915')).toBe('482 915')
    expect(formatRoomCode('K7Q2XM')).toBe('K7Q 2XM')
  })
})

describe('email and password rules', () => {
  test('emails must have a real shape', () => {
    for (const good of ['you@example.com', 'a.b+c@mail.co.th', 'x_y-z@sub.domain.org']) expect(emailError(good)).toBeUndefined()
    for (const bad of ['', 'plain', 'a@b', 'a@b.c', 'a b@c.com', '.a@b.com', 'a..b@c.com', 'a@-b.com', 'a@b..com', 'a@b.com.', '@b.com', 'a@b.c0m', 'x'.repeat(250) + '@b.com']) {
      expect(emailError(bad), bad).toBeTypeOf('string')
    }
    expect(emailError('  you@example.com  ')).toBeUndefined()
  })

  test('passwords need length, a letter and a digit', () => {
    expect(passwordError('abcdefg1')).toBeUndefined()
    expect(passwordError('รหัสผ่านไทย9')).toBeUndefined()
    for (const bad of ['', 'abc1', 'abcdefgh', '12345678', ' abcdefg1', 'abcdefg1 ', 'a1'.repeat(40)]) {
      expect(passwordError(bad), bad).toBeTypeOf('string')
    }
    expect(passwordChecks('abcdefgh').map((c) => c.ok)).toEqual([true, true, false])
    expect(passwordChecks('1234').map((c) => c.ok)).toEqual([false, false, true])
  })

  test('the confirm field is checked against the password', () => {
    const v = { name: '', email: 'you@example.com', password: 'abcdefg1', confirm: 'abcdefg1' }
    expect(validateField('confirm', v)).toBeUndefined()
    expect(validateField('confirm', { ...v, confirm: 'abcdefg2' })).toBeTypeOf('string')
    expect(validateField('confirm', { ...v, confirm: '' })).toBeTypeOf('string')
  })
})

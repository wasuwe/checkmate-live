import { describe, expect, it } from 'vitest'
import {
  CHESS_KINDS,
  cleanStylePrefs,
  DEFAULT_STYLE,
  DEFAULT_STYLES,
  effectiveStyle,
  parseRemoteStyles,
  readyKinds,
  remoteStyleId,
  resetStylePrefsForTest,
  setRemoteStyles,
  PIECE_STYLES,
  styleById,
  styleHas,
  styleKind,
  stylesFor,
} from './pieceStyles'

describe('รูปแบบตัวหมากรุก', () => {
  it('รหัสรูปแบบไม่ซ้ำกัน และแต่ละรูปแบบมีวิธีวาด', () => {
    const ids = PIECE_STYLES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of PIECE_STYLES) expect(Boolean(s.draw) || Boolean(s.images)).toBe(true)
  })

  it('รูปแบบเริ่มต้นมีครบทุกตัว เพราะเป็นตัวสำรองของรูปแบบอื่น', () => {
    for (const kind of CHESS_KINDS) expect(styleHas(styleById(DEFAULT_STYLE), kind)).toBe(true)
  })

  it('ทุกตัวหมากมีรูปแบบให้เลือกอย่างน้อยหนึ่งแบบ', () => {
    for (const kind of CHESS_KINDS) expect(stylesFor(kind).length).toBeGreaterThan(0)
  })

  it('ค่าที่เก็บไว้ซึ่งใช้ไม่ได้ กลับไปเป็นแบบเริ่มต้นเป็นรายตัว', () => {
    expect(cleanStylePrefs(null)).toEqual(DEFAULT_STYLES)
    expect(cleanStylePrefs('x')).toEqual(DEFAULT_STYLES)
    const mixed = cleanStylePrefs({ K: 'shape', N: 'removed-style', P: 7, Q: '<b>', Z: 'shape' })
    // รหัสที่ยังไม่รู้จักถูกเก็บไว้ (รูปแบบจากเซิร์ฟเวอร์มาถึงทีหลัง) แต่ตอนวาดใช้แบบเริ่มต้น
    expect(mixed).toEqual({ ...DEFAULT_STYLES, K: 'shape', N: 'removed-style' })
    expect(effectiveStyle(mixed.N, 'N').id).toBe(DEFAULT_STYLE)
  })

  it('เลือกต่างกันเป็นรายตัวได้', () => {
    const prefs = cleanStylePrefs({ K: 'shape', Q: 'letter', N: 'glyph' })
    expect([prefs.K, prefs.Q, prefs.N, prefs.R]).toEqual(['shape', 'letter', 'glyph', DEFAULT_STYLE])
  })

  it('ตัวหมากรุกไทยใช้รูปแบบของตัวที่หน้าตาตรงกัน ส่วนหมากฮอสและหมากหนีบไม่มีรูปแบบ', () => {
    expect([styleKind('M'), styleKind('S'), styleKind('F'), styleKind('K')]).toEqual(['Q', 'B', 'P', 'K'])
    expect([styleKind('C'), styleKind('H'), styleKind('O')]).toEqual([null, null, null])
  })

  it('รหัสที่ไม่รู้จักได้รูปแบบเริ่มต้น', () => {
    expect(styleById('nope').id).toBe(DEFAULT_STYLE)
    expect(styleById(undefined).id).toBe(DEFAULT_STYLE)
  })
})

describe('รูปแบบที่เพิ่มจากหน้าจัดการ', () => {
  const url = (c: string) => '/api/content-images/' + c.repeat(32)

  it('อ่านเฉพาะค่าที่รูปแบบถูกต้อง', () => {
    expect(parseRemoteStyles(null)).toBeNull()
    expect(parseRemoteStyles({ styles: 'x' })).toBeNull()
    const list = parseRemoteStyles({
      styles: [
        { id: 's1', rev: 2, name: 'น่ารัก', images: { wK: url('a'), bK: url('b'), wQ: 'https://evil.example/x.png', zz: url('c') } },
        { id: 'BAD ID', name: 'x' },
        null,
      ],
    })
    expect(list).toEqual([{ id: 's1', rev: 2, name: 'น่ารัก', images: { wK: url('a'), bK: url('b') } }])
  })

  it('ตัวหมากขึ้นให้เลือกเมื่อมีรูปครบสองสีเท่านั้น', () => {
    const style = { id: 's1', rev: 1, name: 'x', images: { wK: url('a'), bK: url('b'), wQ: url('c') } }
    expect(readyKinds(style)).toEqual(['K'])
    setRemoteStyles([style, { id: 's2', rev: 1, name: 'ว่าง', images: {} }])
    expect(stylesFor('K').map((s) => s.id)).toContain(remoteStyleId('s1'))
    expect(stylesFor('Q').map((s) => s.id)).not.toContain(remoteStyleId('s1'))
    // รูปแบบที่ยังไม่มีตัวไหนพร้อม ไม่ขึ้นเลย
    expect(stylesFor('K').map((s) => s.id)).not.toContain(remoteStyleId('s2'))
    // เลือกไว้แล้วรูปแบบถูกลบ: กลับไปวาดแบบเริ่มต้น
    expect(effectiveStyle(remoteStyleId('s1'), 'K').id).toBe(remoteStyleId('s1'))
    setRemoteStyles([])
    expect(effectiveStyle(remoteStyleId('s1'), 'K').id).toBe(DEFAULT_STYLE)
    resetStylePrefsForTest()
  })
})

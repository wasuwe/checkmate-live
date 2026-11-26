import { describe, expect, it } from 'vitest'
import {
  CHESS_KINDS,
  cleanStylePrefs,
  DEFAULT_STYLE,
  DEFAULT_STYLES,
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
    const mixed = cleanStylePrefs({ K: 'shape', N: 'removed-style', P: 7, Z: 'shape' })
    expect(mixed).toEqual({ ...DEFAULT_STYLES, K: 'shape' })
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

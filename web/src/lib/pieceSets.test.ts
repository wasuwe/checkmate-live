import { describe, expect, test } from 'vitest'
import {
  cleanPrefs,
  DEFAULT_PREFS,
  MAX_SLOTS,
  piecesFor,
  previewCells,
  setById,
  SETS,
  withActive,
  withAddedSlot,
  withoutSlot,
  withSlot,
} from './pieceSets'

// หมากรุกสากล 6 ชนิด, เม็ด โคน เบี้ยหงาย ของหมากรุกไทย, เบี้ยและฮอสของหมากฮอส, หมากของหมากหนีบ
const ALL = ['w', 'b'].flatMap((c) => ['K', 'Q', 'R', 'B', 'N', 'P', 'M', 'S', 'F', 'C', 'H', 'O'].map((k) => c + k))

describe('board sets', () => {
  test('there are twelve sets with unique ids and valid colours', () => {
    expect(SETS).toHaveLength(12)
    expect(new Set(SETS.map((s) => s.id)).size).toBe(12)
    for (const set of SETS) {
      for (const value of [set.light, set.dark, set.w, set.b]) {
        expect(value, set.id).toMatch(/^#[0-9A-F]{6}$/)
      }
      expect(set.w, `${set.id}: the two sides must differ`).not.toBe(set.b)
    }
  })

  test('unknown id falls back to the first set', () => {
    expect(setById('mint').id).toBe('mint')
    expect(setById('nope')).toBe(SETS[0])
    expect(setById(null)).toBe(SETS[0])
  })

  test('every set draws all twelve pieces in its own colours', () => {
    for (const set of SETS) {
      const pieces = piecesFor(set)
      expect(Object.keys(pieces).sort()).toEqual([...ALL].sort())
      const white = pieces.wN().props.children[0].props
      const black = pieces.bN().props.children[0].props
      expect(white.fill).toBe(set.w)
      expect(black.fill).toBe(set.b)
    }
  })

  test('only the piece on the landing square bounces, once per move', () => {
    const pieces = piecesFor(SETS[0], { landOn: 'e4', landKey: 7 })
    const landed = pieces.wP({ square: 'e4' })
    expect(landed.props.className).toBe('piece land')
    expect(landed.key).toBe('land-7')
    expect(pieces.wP({ square: 'e2' }).props.className).toBe('piece')
    expect(pieces.wP().props.className).toBe('piece') // ไม่ได้อยู่บนกระดาน
    // ตาเดินถัดไปลงช่องเดิม: key ต้องเปลี่ยนเพื่อให้เด้งอีกครั้ง
    expect(piecesFor(SETS[0], { landOn: 'e4', landKey: 8 }).wP({ square: 'e4' }).key).toBe('land-8')
  })

  test('the badge can be left out', () => {
    expect(piecesFor(SETS[0]).wK().props.children[1]).toBeTruthy()
    expect(piecesFor(SETS[0], { badge: false }).wK().props.children[1]).toBe(false)
  })

  test('preview shows four pieces on a 4x4 board', () => {
    const cells = previewCells(setById('honey'))
    expect(cells).toHaveLength(16)
    expect(cells.filter((c) => c.glyph !== '')).toHaveLength(4)
    expect(cells[0].bg).toBe('#FFF7DA')
    expect(cells[1].bg).toBe('#FFD36E')
  })
})

describe('saved set slots', () => {
  test('bad stored values are repaired', () => {
    expect(cleanPrefs(null)).toEqual(DEFAULT_PREFS)
    expect(cleanPrefs('junk')).toEqual(DEFAULT_PREFS)
    expect(cleanPrefs({ slots: [], active: 0 })).toEqual(DEFAULT_PREFS)
    expect(cleanPrefs({ slots: ['nope', 42, 'mint'], active: 5 })).toEqual({ slots: ['mint'], active: 0 })
    expect(cleanPrefs({ slots: ['sky', 'soda'], active: 1 })).toEqual({ slots: ['sky', 'soda'], active: 1 })
    expect(cleanPrefs({ slots: ['sky', 'soda'], active: -1 }).active).toBe(0)
    expect(cleanPrefs({ slots: Array(9).fill('sky'), active: 0 }).slots).toHaveLength(MAX_SLOTS)
  })

  test('changing a slot keeps the others', () => {
    const next = withSlot(DEFAULT_PREFS, 1, 'cocoa')
    expect(next.slots).toEqual(['sakura', 'cocoa', 'honey'])
    expect(DEFAULT_PREFS.slots[1]).toBe('mint') // ไม่แก้ของเดิม
    expect(withSlot(DEFAULT_PREFS, 9, 'cocoa')).toBe(DEFAULT_PREFS)
  })

  test('at most five slots', () => {
    let prefs = DEFAULT_PREFS
    for (let i = 0; i < 10; i++) prefs = withAddedSlot(prefs)
    expect(prefs.slots).toHaveLength(MAX_SLOTS)
  })

  test('removing a slot keeps the active set when possible', () => {
    const prefs = { slots: ['sakura', 'mint', 'honey'], active: 2 }
    expect(withoutSlot(prefs, 0)).toEqual({ slots: ['mint', 'honey'], active: 1 }) // ยังเป็น honey
    expect(withoutSlot(prefs, 2)).toEqual({ slots: ['sakura', 'mint'], active: 0 }) // ลบชุดที่ใช้อยู่
    expect(withoutSlot({ slots: ['sakura'], active: 0 }, 0).slots).toEqual(['sakura']) // ต้องเหลืออย่างน้อยหนึ่ง
  })

  test('active slot must exist', () => {
    expect(withActive(DEFAULT_PREFS, 2).active).toBe(2)
    expect(withActive(DEFAULT_PREFS, 3)).toBe(DEFAULT_PREFS)
  })
})

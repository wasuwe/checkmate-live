import { describe, expect, test } from 'vitest'
import {
  cleanPrefs,
  DEFAULT_PREFS,
  MAX_SLOTS,
  pieceSvg,
  piecesFor,
  previewCells,
  setById,
  SETS,
  squareStyle,
  withActive,
  withAddedSlot,
  withoutSlot,
  withSlot,
} from './pieceSets'
import { FABLE_CAST, FABLE_SET_IDS } from './fables'

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

  test('every set is named after a fable and carries its moral', () => {
    for (const set of SETS) {
      expect(set.name.trim(), set.id).not.toBe('')
      expect(set.tale.trim(), set.id).not.toBe('')
    }
    expect(new Set(SETS.map((s) => s.name)).size).toBe(SETS.length)
  })

  test('every set has its fable board pattern and characters', () => {
    for (const set of SETS) {
      expect(FABLE_SET_IDS, set.id).toContain(set.id)
      expect(FABLE_CAST[set.id], set.id).toHaveLength(2)
      expect(squareStyle(set, true).backgroundImage, set.id).toMatch(/^url\("data:image\/svg\+xml,/)
      expect(squareStyle(set, false).backgroundColor, set.id).toBe(set.light)
    }
  })

  test('pieces are drawn as the fable characters unless another style is chosen', () => {
    const set = setById('mint')
    const pawn = pieceSvg(set, 'w', 'P', { badge: false })
    const glyph = pieceSvg(set, 'w', 'P', { badge: false, styles: { K: 'classic', Q: 'classic', R: 'classic', B: 'classic', N: 'classic', P: 'shape' } })
    expect(JSON.stringify(pawn.props.children)).not.toBe(JSON.stringify(glyph.props.children))
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
      // ตัวละครในนิทานใช้สีตัวหมากของชุด
      expect(JSON.stringify(pieces.wN().props.children[0])).toContain(set.w)
      expect(JSON.stringify(pieces.bN().props.children[0])).toContain(set.b)
      // รูปแบบอื่นที่ผู้เล่นเลือกก็ใช้สีของชุดเช่นกัน
      const shaped = piecesFor(set, { styles: { K: 'shape', Q: 'shape', R: 'shape', B: 'shape', N: 'shape', P: 'shape' } })
      expect(shaped.wN().props.children[0].props.fill).toBe(set.w)
      expect(shaped.bN().props.children[0].props.fill).toBe(set.b)
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
    // ตัวหมากคลาสสิกบอกชนิดด้วยรูปทรงเอง จึงไม่มีป้าย ส่วนตัวละครนิทานที่ไม่ใช่เบี้ยมีป้าย
    const fable = { K: 'fable', Q: 'fable', R: 'fable', B: 'fable', N: 'fable', P: 'fable' }
    expect(piecesFor(SETS[0]).wK().props.children[1]).toBe(false)
    expect(piecesFor(SETS[0], { styles: fable }).wK().props.children[1]).toBeTruthy()
    expect(piecesFor(SETS[0], { styles: fable }).wP().props.children[1]).toBe(false)
    expect(piecesFor(SETS[0], { styles: fable, badge: false }).wK().props.children[1]).toBe(false)
  })

  test('preview shows four pieces on a 4x4 board', () => {
    const cells = previewCells(setById('honey'))
    expect(cells).toHaveLength(16)
    expect(cells.filter((c) => c.glyph !== '')).toHaveLength(4)
    expect(cells[0].bg).toBe('#FAF3E0')
    expect(cells[1].bg).toBe('#D8B56C')
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
    const next = withSlot(DEFAULT_PREFS, 1, 'honey')
    expect(next.slots).toEqual(['sky', 'honey', 'cocoa'])
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

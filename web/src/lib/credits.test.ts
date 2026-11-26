import { describe, expect, test } from 'vitest'
import { initialOf, moveIndex, ocNumber, ocsOf, OCS, ownerFilters, PEOPLE, safeLink, selectionFor, TEAM } from './credits'

describe('credits data', () => {
  test('every id that is referenced exists, and ids are unique', () => {
    expect(new Set(OCS.map((o) => o.id)).size).toBe(OCS.length)
    for (const o of OCS) {
      expect(PEOPLE[o.owner], `owner of ${o.id}`).toBeDefined()
      expect(PEOPLE[o.artist], `artist of ${o.id}`).toBeDefined()
      expect(o.color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(o.pale).toMatch(/^#[0-9a-f]{6}$/i)
      expect(o.name.length).toBeGreaterThan(0)
    }
    for (const group of TEAM) for (const id of group.ids) expect(PEOPLE[id], id).toBeDefined()
  })

  test('links are either empty or http(s), and character images are served from our own site', () => {
    for (const p of Object.values(PEOPLE)) expect(p.link === '' || safeLink(p.link) !== null, p.name).toBe(true)
    // รูปจากโดเมนอื่นถูก security headers บล็อก
    for (const o of OCS) if (o.image) expect(o.image, o.id).toMatch(/^\/credits\//)
  })

  test('numbers follow the full list and do not change with the filter', () => {
    expect(ocNumber(OCS[0])).toBe('01')
    expect(ocNumber(OCS[OCS.length - 1])).toBe(String(OCS.length).padStart(2, '0'))
    const filtered = ocsOf(OCS[2].owner)
    expect(ocNumber(filtered[0])).toBe(String(OCS.indexOf(filtered[0]) + 1).padStart(2, '0'))
  })
})

describe('owner filter', () => {
  test('starts with "all", then only people who own a character', () => {
    const filters = ownerFilters()
    expect(filters[0]).toEqual({ id: 'all', label: 'ทั้งหมด' })
    for (const f of filters.slice(1)) expect(ocsOf(f.id).length).toBeGreaterThan(0)
    const owners = new Set(OCS.map((o) => o.owner))
    expect(filters.slice(1).map((f) => f.id).sort()).toEqual([...owners].sort())
  })

  test('one owner can have several characters', () => {
    expect(ocsOf('all')).toEqual(OCS)
    const counts = ownerFilters().slice(1).map((f) => ocsOf(f.id).length)
    expect(counts.reduce((a, b) => a + b, 0)).toBe(OCS.length)
    expect(ocsOf('nobody')).toEqual([])
  })

  test('changing the filter keeps the selection when it is still listed, else picks the first', () => {
    const other = OCS.find((o) => o.owner !== OCS[0].owner)!
    expect(selectionFor('all', other.id)).toBe(other.id)
    expect(selectionFor(other.owner, other.id)).toBe(other.id)
    expect(selectionFor(other.owner, OCS[0].id)).toBe(ocsOf(other.owner)[0].id)
    expect(selectionFor('nobody', OCS[0].id)).toBe(OCS[0].id)
  })
})

describe('arrow keys in the character grid', () => {
  test('left and right move by one, up and down by a row', () => {
    expect(moveIndex('ArrowRight', 0, 6, 3)).toBe(1)
    expect(moveIndex('ArrowLeft', 1, 6, 3)).toBe(0)
    expect(moveIndex('ArrowDown', 1, 6, 3)).toBe(4)
    expect(moveIndex('ArrowUp', 4, 6, 3)).toBe(1)
  })

  test('the selection stays put at the edges and for other keys', () => {
    expect(moveIndex('ArrowLeft', 0, 6, 3)).toBe(0)
    expect(moveIndex('ArrowRight', 5, 6, 3)).toBe(5)
    expect(moveIndex('ArrowUp', 1, 6, 3)).toBe(1)
    expect(moveIndex('ArrowDown', 4, 6, 3)).toBe(4)
    expect(moveIndex('Enter', 2, 6, 3)).toBe(2)
  })
})

describe('links', () => {
  test('only http(s) links are opened', () => {
    expect(safeLink('https://example.com/a')).toBe('https://example.com/a')
    expect(safeLink('http://example.com')).toBe('http://example.com')
    expect(safeLink('')).toBeNull()
    expect(safeLink('javascript:alert(1)')).toBeNull()
    expect(safeLink('//example.com')).toBeNull()
  })
})

describe('placeholder initial', () => {
  test('skips a leading Thai vowel so the consonant is shown', () => {
    expect(initialOf('ไข่มุก')).toBe('ข')
    expect(initialOf('โกโก้')).toBe('ก')
    expect(initialOf('ผึ้ง')).toBe('ผ')
    expect(initialOf('Nok')).toBe('N')
    expect(initialOf('ไ')).toBe('ไ')
    expect(initialOf('')).toBe('')
  })
})

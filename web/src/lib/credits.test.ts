import { describe, expect, test } from 'vitest'
import {
  boardLayout,
  initialOf,
  moveIndex,
  ocNumber,
  ocsOf,
  ownerFilters,
  parseCredits,
  personOf,
  safeColor,
  safeImage,
  safeLink,
  SAMPLE_CREDITS as DATA,
  selectionFor,
} from './credits'

describe('sample credits data', () => {
  test('every id that is referenced exists, and ids are unique', () => {
    const people = new Set(DATA.people.map((p) => p.id))
    expect(people.size).toBe(DATA.people.length)
    expect(new Set(DATA.ocs.map((o) => o.id)).size).toBe(DATA.ocs.length)
    for (const o of DATA.ocs) {
      expect(people.has(o.owner), `owner of ${o.id}`).toBe(true)
      expect(people.has(o.artist), `artist of ${o.id}`).toBe(true)
      expect(o.color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(o.pale).toMatch(/^#[0-9a-f]{6}$/i)
      expect(o.name.length).toBeGreaterThan(0)
    }
    for (const group of DATA.team) for (const id of group.ids) expect(people.has(id), id).toBe(true)
  })

  test('every sample item has an id and a revision, as the server requires', () => {
    for (const item of [...DATA.people, ...DATA.team, ...DATA.ocs]) {
      expect(item.id).toMatch(/^[a-z0-9_-]{1,24}$/)
      expect(item.rev).toBe(1)
    }
    expect(new Set(DATA.team.map((g) => g.id)).size).toBe(DATA.team.length)
  })

  test('the sample has no links and no images, so nothing fake can be clicked', () => {
    for (const p of DATA.people) expect(p.link).toBe('')
    for (const o of DATA.ocs) expect(o.image).toBe('')
  })

  test('numbers follow the full list and do not change with the filter', () => {
    expect(ocNumber(DATA, DATA.ocs[0])).toBe('01')
    expect(ocNumber(DATA, DATA.ocs[DATA.ocs.length - 1])).toBe(String(DATA.ocs.length).padStart(2, '0'))
    const filtered = ocsOf(DATA, DATA.ocs[2].owner)
    expect(ocNumber(DATA, filtered[0])).toBe(String(DATA.ocs.indexOf(filtered[0]) + 1).padStart(2, '0'))
  })

  test('a reference to someone who does not exist does not break the page', () => {
    expect(personOf(DATA, 'nok').name).toBe('Nok')
    expect(personOf(DATA, 'ghost')).toMatchObject({ name: 'ไม่ระบุชื่อ', link: '' })
  })
})

describe('owner filter', () => {
  test('starts with "all", then only people who own a character', () => {
    const filters = ownerFilters(DATA)
    expect(filters[0]).toEqual({ id: 'all', label: 'ทั้งหมด' })
    for (const f of filters.slice(1)) expect(ocsOf(DATA, f.id).length).toBeGreaterThan(0)
    const owners = new Set(DATA.ocs.map((o) => o.owner))
    expect(filters.slice(1).map((f) => f.id).sort()).toEqual([...owners].sort())
  })

  test('one owner can have several characters', () => {
    expect(ocsOf(DATA, 'all')).toEqual(DATA.ocs)
    const counts = ownerFilters(DATA).slice(1).map((f) => ocsOf(DATA, f.id).length)
    expect(counts.reduce((a, b) => a + b, 0)).toBe(DATA.ocs.length)
    expect(ocsOf(DATA, 'nobody')).toEqual([])
  })

  test('changing the filter keeps the selection when it is still listed, else picks the first', () => {
    const other = DATA.ocs.find((o) => o.owner !== DATA.ocs[0].owner)!
    expect(selectionFor(DATA, 'all', other.id)).toBe(other.id)
    expect(selectionFor(DATA, other.owner, other.id)).toBe(other.id)
    expect(selectionFor(DATA, other.owner, DATA.ocs[0].id)).toBe(ocsOf(DATA, other.owner)[0].id)
    expect(selectionFor(DATA, 'nobody', DATA.ocs[0].id)).toBe(DATA.ocs[0].id)
    expect(selectionFor({ people: [], team: [], ocs: [] }, 'all', 'x')).toBe('')
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

// ข้อมูลมาจากเซิร์ฟเวอร์และ admin เป็นคนพิมพ์ ค่าที่จะถูกใส่ลงใน href, style และ src ถูกกรองอีกชั้นที่หน้าเว็บ
describe('values from the server are filtered before they reach the page', () => {
  test('only http(s) links are opened', () => {
    expect(safeLink('https://example.com/a')).toBe('https://example.com/a')
    expect(safeLink('http://example.com')).toBe('http://example.com')
    expect(safeLink('')).toBeNull()
    expect(safeLink('javascript:alert(1)')).toBeNull()
    expect(safeLink('//example.com')).toBeNull()
  })

  test('only #rrggbb colours are used in styles', () => {
    expect(safeColor('#FF8FB1')).toBe('#FF8FB1')
    expect(safeColor('red')).toBe('#FFFFFF')
    expect(safeColor('#fff;background:url(https://evil.example/x)', '#000000')).toBe('#000000')
    expect(safeColor('')).toBe('#FFFFFF')
  })

  test('only images served by our own image route are shown', () => {
    const ok = '/api/content-images/0123456789abcdef0123456789abcdef'
    expect(safeImage(ok)).toBe(ok)
    expect(safeImage('')).toBeNull()
    expect(safeImage('https://evil.example/x.png')).toBeNull()
    expect(safeImage('/api/content-images/../admin/me')).toBeNull()
    expect(safeImage(ok + '?x=1')).toBeNull()
  })
})

describe('reading the server response', () => {
  test('a well-formed document is read as is', () => {
    expect(parseCredits(JSON.parse(JSON.stringify(DATA)))).toEqual(DATA)
  })

  test('anything that is not a credits document is rejected', () => {
    for (const bad of [null, undefined, 'x', 3, [], {}, { people: [], team: [] }, { people: {}, team: [], ocs: [] }]) {
      expect(parseCredits(bad)).toBeNull()
    }
  })

  test('missing or wrongly typed fields become empty values instead of breaking the page', () => {
    const parsed = parseCredits({ people: [{ id: 'a', name: 5 }, null], team: [{ role: 'Dev', ids: ['a', 7] }], ocs: [{ id: 'o' }] })
    expect(parsed?.people[0]).toEqual({ id: 'a', rev: 0, name: '', handle: '', link: '', bg: '', image: '' })
    expect(parsed?.people[1].id).toBe('')
    expect(parsed?.team[0]).toEqual({ id: '', rev: 0, role: 'Dev', bg: '', ids: ['a'] })
    expect(parsed?.ocs[0]).toMatchObject({ id: 'o', rev: 0, name: '', image: '', owner: '' })
    expect(parseCredits({ people: [{ id: 'a', rev: 3 }, { id: 'b', rev: '4' }], team: [], ocs: [] })?.people.map((p) => p.rev)).toEqual([3, 0])
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

describe('credits board', () => {
  const person = (id: string) => ({ id, rev: 1, name: id, handle: '', link: '', bg: '#FFFFFF', image: '' })
  const data = (team: { role: string; ids: string[] }[], ids: string[]) => ({
    people: ids.map(person),
    team: team.map((g, i) => ({ id: 'g' + i, rev: 1, bg: '#FFFFFF', ...g })),
    ocs: [],
  })

  test('groups alternate sides and each person stands on one square with all their roles', () => {
    const b = boardLayout(data([{ role: 'Dev', ids: ['a', 'b'] }, { role: 'Art', ids: ['c', 'a'] }, { role: 'QA', ids: ['d'] }], ['a', 'b', 'c', 'd']))
    expect(b.seats.map((s) => [s.person.id, s.side])).toEqual([['a', 0], ['b', 0], ['c', 1], ['d', 0]])
    expect(b.seats[0].roles.map((r) => r.role)).toEqual(['Dev', 'Art'])
    expect(b.sides).toEqual([['Dev', 'QA'], ['Art']])
    const squares = b.seats.map((s) => `${s.side}:${s.rank}:${s.file}`)
    expect(new Set(squares).size).toBe(squares.length)
  })

  test('a single group is split so two sides still face each other', () => {
    const b = boardLayout(data([{ role: 'Dev', ids: ['a', 'b', 'c'] }], ['a', 'b', 'c']))
    expect(b.seats.map((s) => s.side)).toEqual([0, 1, 0])
  })

  test('a side holds 16 people, the rest overflow, and unknown ids are skipped', () => {
    const ids = Array.from({ length: 18 }, (_, i) => 'p' + i)
    const b = boardLayout(data([{ role: 'Dev', ids: [...ids, 'ghost'] }, { role: 'Art', ids: [] }], ids))
    expect(b.seats.length + b.overflow.length).toBe(18)
    expect(b.seats.every((s) => s.rank >= 0 && s.rank <= 3 && s.file >= 0 && s.file <= 3)).toBe(true)
  })
})

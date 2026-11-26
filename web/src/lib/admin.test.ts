import { describe, expect, test } from 'vitest'
import {
  addGroup,
  addOc,
  addPerson,
  fieldLabel,
  firstProblem,
  fitWithin,
  moved,
  newId,
  ocsUsing,
  removePerson,
  replaced,
  toggleMember,
} from './admin'
import { SAMPLE_CREDITS as DATA, type CreditsData } from './credits'

const EMPTY: CreditsData = { people: [], team: [], ocs: [] }

describe('adding and removing people', () => {
  test('a new person gets an id that is not taken, and the original data is untouched', () => {
    const next = addPerson(DATA)
    expect(next.people).toHaveLength(DATA.people.length + 1)
    expect(DATA.people).toHaveLength(4)
    const added = next.people[next.people.length - 1]
    expect(DATA.people.some((p) => p.id === added.id)).toBe(false)
    expect(added.id).toMatch(/^[a-z0-9_-]{1,24}$/)
    expect(added.bg).toMatch(/^#[0-9A-F]{6}$/)
  })

  test('ids stay unique when earlier ones are already used', () => {
    expect(newId('p', [])).toBe('p1')
    expect(newId('p', ['p1'])).toBe('p2')
    expect(newId('p', ['p2', 'p3'])).toBe('p4')
    expect(newId('oc', ['oc1', 'x'])).toBe('oc3')
  })

  test('someone who still owns or draws a character cannot be removed', () => {
    expect(ocsUsing(DATA, 'mew').map((o) => o.id)).toEqual(['kaimuk', 'phueng', 'kong'])
    expect(removePerson(DATA, 'mew')).toBe(DATA)
  })

  test('removing a person also takes them out of every team group', () => {
    const extra = addPerson(DATA)
    const id = extra.people[extra.people.length - 1].id
    const inTeam = toggleMember(extra, 0, id)
    expect(inTeam.team[0].ids).toContain(id)
    const removed = removePerson(inTeam, id)
    expect(removed.people.some((p) => p.id === id)).toBe(false)
    expect(removed.team[0].ids).not.toContain(id)
  })
})

describe('team groups and characters', () => {
  test('toggling a member adds then removes them, only in that group', () => {
    const added = toggleMember(DATA, 0, 'mew')
    expect(added.team[0].ids).toEqual(['nok', 'tae', 'mew'])
    expect(added.team[1].ids).toEqual(DATA.team[1].ids)
    expect(toggleMember(added, 0, 'mew').team[0].ids).toEqual(['nok', 'tae'])
  })

  test('a new group starts empty', () => {
    const next = addGroup(DATA)
    expect(next.team[next.team.length - 1]).toMatchObject({ role: '', ids: [] })
  })

  test('a new character belongs to the first person, and needs at least one person', () => {
    const next = addOc(DATA)
    const oc = next.ocs[next.ocs.length - 1]
    expect(oc).toMatchObject({ owner: 'nok', artist: 'nok', name: '', image: '' })
    expect(DATA.ocs.some((o) => o.id === oc.id)).toBe(false)
    expect(addOc(EMPTY)).toBe(EMPTY)
  })

  test('moving and replacing return new lists and ignore impossible moves', () => {
    const list = ['a', 'b', 'c']
    expect(moved(list, 0, 1)).toEqual(['b', 'a', 'c'])
    expect(moved(list, 2, -1)).toEqual(['a', 'c', 'b'])
    expect(moved(list, 0, -1)).toBe(list)
    expect(moved(list, 2, 1)).toBe(list)
    expect(list).toEqual(['a', 'b', 'c'])
    expect(replaced([{ n: 1, m: 2 }, { n: 3, m: 4 }], 1, { n: 9 })).toEqual([{ n: 1, m: 2 }, { n: 9, m: 4 }])
  })
})

describe('messages', () => {
  test('server field names are turned into readable Thai', () => {
    expect(fieldLabel('ocs[2].owner')).toBe('ตัวละครลำดับที่ 3: เจ้าของ')
    expect(fieldLabel('people[0].link')).toContain('คนลำดับที่ 1: ลิงก์')
    expect(fieldLabel('team[1].ids[0]')).toBe('กลุ่มทีมลำดับที่ 2: สมาชิก')
    expect(fieldLabel('ocs')).toBe('จำนวนตัวละครมากเกินไป')
    expect(fieldLabel('<script>')).toBe('ข้อมูลบางช่อง')
  })

  test('obvious problems are caught before sending', () => {
    expect(firstProblem(DATA)).toBe('')
    expect(firstProblem(addPerson(DATA))).toBe('คนลำดับที่ 5 ยังไม่มีชื่อ')
    expect(firstProblem(addGroup(DATA))).toBe('กลุ่มทีมลำดับที่ 3 ยังไม่มีชื่อบทบาท')
    expect(firstProblem(addOc(DATA))).toBe('ตัวละครลำดับที่ 7 ยังไม่มีชื่อ')
    const badLink = { ...DATA, people: replaced(DATA.people, 0, { link: 'example.com' }) }
    expect(firstProblem(badLink)).toContain('ลิงก์ของ Nok')
  })
})

describe('image size before upload', () => {
  test('large images are scaled down keeping their shape, small ones are left alone', () => {
    expect(fitWithin(2000, 1000, 1000)).toEqual({ width: 1000, height: 500 })
    expect(fitWithin(900, 1800, 1000)).toEqual({ width: 500, height: 1000 })
    expect(fitWithin(400, 300, 1000)).toEqual({ width: 400, height: 300 })
    expect(fitWithin(5000, 1, 1000)).toEqual({ width: 1000, height: 1 })
  })
})

import { describe, expect, test } from 'vitest'
import {
  filterMembers,
  formatDate,
  formatDuration,
  parseMemberDetail,
  parseMembers,
  personLabel,
  sortMembers,
  summarize,
  timeAgo,
  winRate,
  type Member,
} from './members'

const member = (patch: Partial<Member> = {}): Member => ({
  id: 'a',
  email: 'a@example.com',
  joinedAt: '2026-11-01T09:00:00Z',
  games: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  seconds: 0,
  ...patch,
})

const nok = member({ id: 'nok', email: 'nok@example.com', name: 'นก', joinedAt: '2026-11-03T09:00:00Z', games: 5, wins: 3, losses: 1, draws: 1, seconds: 4000, lastPlayedAt: '2026-11-20T10:00:00Z', live: { status: 'playing', game: 'chess', room: 'K7Q2XM', connected: true } })
const tae = member({ id: 'tae', email: 'Tae@Example.com', joinedAt: '2026-11-02T09:00:00Z', games: 9, wins: 2, losses: 7, seconds: 900, lastPlayedAt: '2026-11-25T10:00:00Z', live: { status: 'waiting', game: 'makruk', room: 'A2B3C4', connected: false } })
const mew = member({ id: 'mew', email: 'mew@example.com', name: 'Mew', joinedAt: '2026-11-04T09:00:00Z' })
const all = [mew, nok, tae]

describe('reading the server response', () => {
  test('a list is accepted only when every row has the fields the page needs', () => {
    expect(parseMembers({ users: all })).toEqual(all)
    expect(parseMembers({ users: [] })).toEqual([])
    expect(parseMembers(null)).toBeNull()
    expect(parseMembers({ users: 'x' })).toBeNull()
    expect(parseMembers({ users: [{ ...nok, id: '' }] })).toBeNull()
    expect(parseMembers({ users: [{ ...nok, games: '5' }] })).toBeNull()
    expect(parseMembers({ users: [{ id: 'x', email: 'x@example.com' }] })).toBeNull()
  })

  test('a detail needs the three lists', () => {
    const detail = { ...nok, byGame: [], opponents: [], recent: [] }
    expect(parseMemberDetail({ user: detail })).toEqual(detail)
    expect(parseMemberDetail({ user: nok })).toBeNull()
    expect(parseMemberDetail({ user: { ...detail, recent: null } })).toBeNull()
    expect(parseMemberDetail({})).toBeNull()
  })
})

describe('labels', () => {
  test('a person is called by name, then email, then as a guest', () => {
    expect(personLabel({ name: 'นก', email: 'nok@example.com' })).toBe('นก')
    expect(personLabel({ email: 'nok@example.com' })).toBe('nok@example.com')
    expect(personLabel({})).toBe('ผู้เล่นรับเชิญ')
  })

  test('play time reads in the largest sensible unit', () => {
    expect(formatDuration(0)).toBe('–')
    expect(formatDuration(-5)).toBe('–')
    expect(formatDuration(45)).toBe('45 วินาที')
    expect(formatDuration(60)).toBe('1 นาที')
    expect(formatDuration(59 * 60)).toBe('59 นาที')
    expect(formatDuration(3600)).toBe('1 ชม.')
    expect(formatDuration(2 * 3600 + 5 * 60)).toBe('2 ชม. 5 นาที')
    expect(formatDuration(3599)).toBe('1 ชม.') // ปัดเป็น 60 นาที ต้องไม่แสดง "60 นาที"
  })

  test('win rate is a whole percentage, and nothing before the first game', () => {
    expect(winRate({ games: 0, wins: 0 })).toBeNull()
    expect(winRate({ games: 3, wins: 1 })).toBe(33)
    expect(winRate({ games: 4, wins: 4 })).toBe(100)
  })

  test('time ago', () => {
    const now = new Date('2026-11-27T12:00:00Z').getTime()
    expect(timeAgo(undefined, now)).toBe('–')
    expect(timeAgo('nonsense', now)).toBe('–')
    expect(timeAgo('2026-11-27T11:59:40Z', now)).toBe('เมื่อสักครู่')
    expect(timeAgo('2026-11-27T11:15:00Z', now)).toBe('45 นาทีก่อน')
    expect(timeAgo('2026-11-27T07:00:00Z', now)).toBe('5 ชั่วโมงก่อน')
    expect(timeAgo('2026-11-20T12:00:00Z', now)).toBe('7 วันก่อน')
    expect(timeAgo('2026-08-01T12:00:00Z', now)).toBe(formatDate('2026-08-01T12:00:00Z'))
    expect(formatDate(undefined)).toBe('–')
    expect(formatDate('2026-08-01T12:00:00Z')).not.toBe('–')
  })
})

describe('finding members', () => {
  test('search matches the name or the email, in any letter case', () => {
    expect(filterMembers(all, '', 'all')).toEqual(all)
    expect(filterMembers(all, '  นก ', 'all')).toEqual([nok])
    expect(filterMembers(all, 'TAE@', 'all')).toEqual([tae])
    expect(filterMembers(all, 'mew', 'all')).toEqual([mew])
    expect(filterMembers(all, 'example.com', 'all')).toHaveLength(3)
    expect(filterMembers(all, 'nobody', 'all')).toEqual([])
  })

  test('groups: in a room now, has played, never played', () => {
    expect(filterMembers(all, '', 'live')).toEqual([nok, tae])
    expect(filterMembers(all, '', 'played')).toEqual([nok, tae])
    expect(filterMembers(all, '', 'never')).toEqual([mew])
    expect(filterMembers(all, 'tae', 'never')).toEqual([])
  })

  test('sorting does not change the given list, and ties fall back to the newest sign-up', () => {
    const input = [...all]
    expect(sortMembers(input, 'joined').map((m) => m.id)).toEqual(['mew', 'nok', 'tae'])
    expect(sortMembers(input, 'recent').map((m) => m.id)).toEqual(['tae', 'nok', 'mew'])
    expect(sortMembers(input, 'games').map((m) => m.id)).toEqual(['tae', 'nok', 'mew'])
    expect(sortMembers(input, 'time').map((m) => m.id)).toEqual(['nok', 'tae', 'mew'])
    expect(sortMembers(input, 'name').map((m) => m.id)).toEqual(['nok', 'mew', 'tae']) // นก, Mew, Tae@… (ไทยก่อนอังกฤษ)
    expect(input).toEqual(all)
    const twins = [member({ id: 'old', joinedAt: '2026-01-01T00:00:00Z' }), member({ id: 'new', joinedAt: '2026-06-01T00:00:00Z' })]
    expect(sortMembers(twins, 'games').map((m) => m.id)).toEqual(['new', 'old'])
  })

  test('summary counts', () => {
    expect(summarize(all)).toEqual({ total: 3, playing: 1, waiting: 1, played: 2 })
    expect(summarize([])).toEqual({ total: 0, playing: 0, waiting: 0, played: 0 })
  })
})

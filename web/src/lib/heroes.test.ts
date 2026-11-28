import { describe, expect, test } from 'vitest'
import { FABLE_CAST, FABLE_LINE_SET_IDS, FABLE_SET_IDS, fableLine, type FableMoment } from './fables'
import { HERO_SET_IDS, heroFigure } from './heroes'
import { SETS } from './pieceSets'

describe('fable heroes', () => {
  test('every piece set has a hero for each side, matching the cast of its fable', () => {
    expect([...HERO_SET_IDS].sort()).toEqual([...FABLE_SET_IDS].sort())
    for (const set of SETS) {
      expect(FABLE_CAST[set.id], set.id).toHaveLength(2)
      for (const color of ['w', 'b'] as const) {
        expect(heroFigure(set.id, { fill: color === 'w' ? set.w : set.b, ink: '#2B2A33', color }), `${set.id} ${color}`).toBeDefined()
      }
    }
  })

  test('a set without heroes has none, so callers fall back to the pawn', () => {
    expect(heroFigure('no-such-set', { fill: '#fff', ink: '#000', color: 'w' })).toBeUndefined()
  })

  // คำพูดในฉากตัวละครโผล่: ทุกตัวละครมีคำครบห้าจังหวะ ไม่ซ้ำกันในตัวเดียว และไม่ใช้ขีดหรือจุดคั่น
  test('every character has a line for each of the five moments', () => {
    const moments: FableMoment[] = ['pawn', 'piece', 'queen', 'check', 'mate']
    expect([...FABLE_LINE_SET_IDS].sort()).toEqual([...FABLE_SET_IDS].sort())
    for (const set of SETS) {
      for (const color of ['w', 'b'] as const) {
        const lines = moments.map((m) => fableLine(set.id, color, m))
        for (const line of lines) {
          expect(line.length, `${set.id} ${color}`).toBeGreaterThan(0)
          expect(line, `${set.id} ${color}`).not.toMatch(/[—–·]/)
          // ยาวเกินไปจะขึ้นเกินสองบรรทัดในครึ่งแถบ
          expect(line.replace(/[ัิ-ฺ็-๎]/g, '').length, line).toBeLessThanOrEqual(18)
        }
        expect(new Set(lines).size, `${set.id} ${color}`).toBe(5)
      }
    }
    expect(fableLine('no-such-set', 'w', 'mate')).toBe('')
  })
})

import { describe, expect, test } from 'vitest'
import { FABLE_CAST, FABLE_SET_IDS } from './fables'
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
})

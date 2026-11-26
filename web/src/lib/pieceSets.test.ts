import { describe, expect, test } from 'vitest'
import { DEFAULT_PIECE_SET, imageSet, PIECE_SETS, pieceSetById } from './pieceSets'

const ALL = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP']

describe('piece sets', () => {
  test('every set draws all twelve pieces', () => {
    for (const set of PIECE_SETS) {
      for (const piece of ALL) {
        expect(typeof set.pieces[piece], `${set.id} ${piece}`).toBe('function')
        expect(set.pieces[piece]()).toBeTruthy()
      }
    }
  })

  test('set ids are unique', () => {
    expect(new Set(PIECE_SETS.map((s) => s.id)).size).toBe(PIECE_SETS.length)
  })

  test('unknown or missing id falls back to the default set', () => {
    expect(pieceSetById('symbols').id).toBe('symbols')
    expect(pieceSetById('nope')).toBe(DEFAULT_PIECE_SET)
    expect(pieceSetById(null)).toBe(DEFAULT_PIECE_SET)
  })

  test('imageSet points at one file per piece', () => {
    const set = imageSet('/pieces/mine', 'svg')
    expect(Object.keys(set).sort()).toEqual([...ALL].sort())
    expect(set.bN().props.src).toBe('/pieces/mine/bN.svg')
  })
})

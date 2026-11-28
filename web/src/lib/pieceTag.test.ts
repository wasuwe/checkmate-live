import { describe, expect, test } from 'vitest'
import { placeTag } from './pieceTag'

const none = new Set<string>()
const START = new Set(
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].flatMap((f) => [f + '1', f + '2', f + '7', f + '8']),
)

describe('the label of the hovered piece sits next to it', () => {
  test('goes above the piece when nothing is in the way', () => {
    const place = placeTag('e4', false, none, none)
    expect(place.side).toBe('above')
    // เหนือช่อง e4: ขอบล่างของป้ายอยู่ที่ขอบบนของช่อง (แถวที่ 5 จากบน = 50%)
    expect(place.tag).toMatchObject({ top: '50%', '--tag-x': '56.25%' })
  })

  test('avoids the squares that are lit for the piece', () => {
    // ม้า g1 ตอนเริ่มเกม: ช่องที่เดินได้ (f3, h3) อยู่เหนือหมาก ป้ายจึงไปอยู่ด้านซ้าย
    const place = placeTag('g1', false, new Set(['f3', 'h3']), START)
    expect(place.side).toBe('left')
    expect(place.tag).toMatchObject({ right: '25%' })
  })

  test('stays inside the board at the edges', () => {
    expect(placeTag('a8', false, none, none).side).not.toBe('above')
    expect(placeTag('a8', false, none, none).side).not.toBe('left')
    expect(placeTag('h1', false, none, none).side).not.toBe('right')
    expect(placeTag('h1', false, none, none).side).not.toBe('below')
  })

  test('follows the board when it is flipped for black', () => {
    // ฝั่งดำเห็น e7 อยู่แถวที่ 7 จากบน คอลัมน์ที่ 4 จากซ้าย
    const place = placeTag('e7', true, none, none)
    expect(place.side).toBe('above')
    expect(place.tag).toMatchObject({ top: '75%', '--tag-x': '43.75%' })
  })
})

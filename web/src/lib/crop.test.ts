import { describe, expect, test } from 'vitest'
import { clampView, coverScale, outputSize, panView, sourceRect, START_VIEW } from './crop'

const wide = { width: 2000, height: 1000 }
const square = { width: 300, height: 300 }

describe('crop', () => {
  test('at zoom 1 the image just covers the frame, cropped around the centre', () => {
    expect(coverScale(wide, square)).toBe(0.3)
    expect(sourceRect(START_VIEW, wide, square)).toEqual({ x: 500, y: 0, width: 1000, height: 1000 })
    // กรอบแนวตั้ง 3:4 บนรูปแนวนอน
    const r = sourceRect(START_VIEW, wide, { width: 225, height: 300 })
    expect([r.x, r.y, r.width, r.height]).toEqual([625, 0, 750, 1000])
  })

  test('zooming in takes a smaller part of the image', () => {
    expect(sourceRect({ zoom: 2, cx: 0.5, cy: 0.5 }, wide, square)).toEqual({ x: 750, y: 250, width: 500, height: 500 })
  })

  test('the frame can never leave the image', () => {
    expect(clampView({ zoom: 1, cx: 0, cy: 0 }, wide, square)).toEqual({ zoom: 1, cx: 0.25, cy: 0.5 })
    expect(sourceRect({ zoom: 1, cx: 9, cy: 9 }, wide, square)).toEqual({ x: 1000, y: 0, width: 1000, height: 1000 })
    expect(clampView({ zoom: 99, cx: 0.5, cy: 0.5 }, wide, square).zoom).toBe(5)
    expect(clampView({ zoom: NaN, cx: NaN, cy: NaN }, wide, square)).toEqual({ zoom: 1, cx: 0.5, cy: 0.5 })
  })

  test('dragging right moves the image right, so the crop moves left on the image', () => {
    // 30px บนจอ = 100px ของรูป (scale 0.3)
    const moved = panView(START_VIEW, 30, 0, wide, square)
    expect(sourceRect(moved, wide, square).x).toBeCloseTo(400)
    // ลากเกินขอบ: หยุดที่ขอบรูป
    expect(sourceRect(panView(START_VIEW, 9999, 0, wide, square), wide, square).x).toBeCloseTo(0)
  })

  test('the result is capped at the maximum side and small images are not enlarged', () => {
    expect(outputSize({ width: 1000, height: 1000 }, 512)).toEqual({ width: 512, height: 512 })
    expect(outputSize({ width: 750, height: 1000 }, 500)).toEqual({ width: 375, height: 500 })
    expect(outputSize({ width: 120, height: 90 }, 512)).toEqual({ width: 120, height: 90 })
  })
})

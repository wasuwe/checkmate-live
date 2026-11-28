import { describe, expect, test } from 'vitest'
import { keepThaiWords, WORD_JOINER } from './thaiBreak'
import { THAI_COMPOUNDS } from './thaiCompounds'

const strip = (text: string) => text.replaceAll(WORD_JOINER, '')

describe('Thai compounds stay on one line', () => {
  test('a joiner goes inside a compound, and the visible text is unchanged', () => {
    const text = 'ผู้เล่นฝ่ายตรงข้ามเดินหมากรุกสากล'
    const kept = keepThaiWords(text)
    expect(strip(kept)).toBe(text)
    expect(kept).toContain(`ผู้${WORD_JOINER}เล่น`)
    expect(kept).toContain(`ตรง${WORD_JOINER}ข้าม`)
    // คำที่ซ้อนเหลื่อมกัน (เดินหมาก / หมากรุก / หมากรุกสากล) ถูกปิดครบทุกรอยต่อ
    expect(kept).toContain(`เดิน${WORD_JOINER}หมาก${WORD_JOINER}รุก${WORD_JOINER}สากล`)
    expect(kept).toContain(`หมาก${WORD_JOINER}รุก${WORD_JOINER}สากล`)
  })

  test('text without a listed compound, or without Thai, is returned as it is', () => {
    expect(keepThaiWords('Checkmate!')).toBe('Checkmate!')
    expect(keepThaiWords('')).toBe('')
    expect(keepThaiWords('กิน')).toBe('กิน')
  })

  test('the generated list is sane: Thai only, at least one break point each, no duplicates', () => {
    expect(THAI_COMPOUNDS.length).toBeGreaterThan(50)
    expect(new Set(THAI_COMPOUNDS).size).toBe(THAI_COMPOUNDS.length)
    for (const c of THAI_COMPOUNDS) {
      expect(c, c).toMatch(/^[฀-๿]+(\|[฀-๿]+)+$/)
    }
  })
})

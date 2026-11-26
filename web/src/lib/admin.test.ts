import { describe, expect, test } from 'vitest'
import { fieldLabel, fitWithin, isDirty, ocsUsing, orderAfterMove, problemIn, readResult } from './admin'
import { SAMPLE_CREDITS as DATA } from './credits'

describe('reading what the server answers', () => {
  const credits = JSON.parse(JSON.stringify(DATA))

  test('a successful change carries the new data', () => {
    const result = readResult(200, { credits })
    expect(result).toEqual({ status: 'ok', data: DATA })
    expect(readResult(200, { credits: 'nope' })).toMatchObject({ status: 'error' })
  })

  test('a refused change because someone else edited the item is a conflict, with the latest data', () => {
    const result = readResult(409, { error: 'conflict', credits })
    expect(result.status).toBe('conflict')
    if (result.status === 'conflict') {
      expect(result.data).toEqual(DATA)
      expect(result.message).toContain('มีคนอื่นแก้หรือลบรายการนี้ไปก่อนแล้ว')
    }
  })

  test('the other refusals explain themselves', () => {
    expect(readResult(409, { error: 'in_use', credits })).toMatchObject({ status: 'conflict', message: expect.stringContaining('ยังเป็นเจ้าของหรือผู้วาด') })
    expect(readResult(409, { error: 'exists', credits })).toMatchObject({ status: 'conflict', message: 'มีคนตั้งต้นข้อมูลไปแล้ว' })
    // 409 ที่ไม่มีข้อมูลแนบมาก็ยังเป็น conflict
    expect(readResult(409, {})).toMatchObject({ status: 'conflict', data: null })
  })

  test('errors are turned into Thai messages', () => {
    expect(readResult(400, { error: 'bad_credits', field: 'ocs[2].owner' })).toEqual({ status: 'error', message: 'ข้อมูลไม่ถูกต้องที่ ตัวละครลำดับที่ 3: เจ้าของ' })
    expect(readResult(403, { error: 'forbidden' })).toEqual({ status: 'error', message: 'บัญชีนี้ไม่มีสิทธิ์จัดการข้อมูล' })
    expect(readResult(400, { error: 'bad_image' })).toMatchObject({ message: expect.stringContaining('PNG หรือ JPEG') })
    expect(readResult(500, null)).toEqual({ status: 'error', message: 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง' })
  })

  test('server field names are turned into readable Thai', () => {
    expect(fieldLabel('ocs[2].owner')).toBe('ตัวละครลำดับที่ 3: เจ้าของ')
    expect(fieldLabel('people[0].link')).toContain('คนลำดับที่ 1: ลิงก์')
    expect(fieldLabel('team[1].ids[0]')).toBe('กลุ่มทีมลำดับที่ 2: สมาชิก')
    expect(fieldLabel('ocs')).toBe('จำนวนตัวละครมากเกินไป')
    expect(fieldLabel('ocs.owner')).toBe('ตัวละคร: เจ้าของ')
    expect(fieldLabel('<script>')).toBe('ข้อมูลบางช่อง')
  })
})

describe('editing one item', () => {
  test('a draft is dirty only when a field the form owns has changed', () => {
    const oc = DATA.ocs[0]
    expect(isDirty({ ...oc }, oc)).toBe(false)
    expect(isDirty({ ...oc, name: 'อื่น' }, oc)).toBe(true)
    expect(isDirty({ ...oc, bio: oc.bio + ' ' }, oc)).toBe(true)
    // rev และ image เปลี่ยนที่เซิร์ฟเวอร์ ไม่ใช่สิ่งที่ผู้แก้พิมพ์
    expect(isDirty({ ...oc, rev: 9 }, oc)).toBe(false)
    expect(isDirty({ ...oc, image: '/api/content-images/0123456789abcdef0123456789abcdef' }, oc)).toBe(false)
    const group = DATA.team[0]
    expect(isDirty({ ...group, ids: [...group.ids] }, group)).toBe(false)
    expect(isDirty({ ...group, ids: [...group.ids, 'mew'] }, group)).toBe(true)
  })

  test('obvious problems are caught before sending', () => {
    expect(problemIn('people', DATA.people[0])).toBe('')
    expect(problemIn('people', { ...DATA.people[0], name: '  ' })).toBe('ยังไม่มีชื่อ')
    expect(problemIn('people', { ...DATA.people[0], link: 'example.com' })).toContain('ลิงก์ต้องขึ้นต้นด้วย http')
    expect(problemIn('people', { ...DATA.people[0], link: 'https://example.com' })).toBe('')
    expect(problemIn('team', { ...DATA.team[0], role: '' })).toBe('ยังไม่มีชื่อบทบาท')
    expect(problemIn('team', DATA.team[0])).toBe('')
    expect(problemIn('ocs', { ...DATA.ocs[0], name: '' })).toBe('ยังไม่มีชื่อ')
  })

  test('someone who still owns or draws a character is reported as in use', () => {
    expect(ocsUsing(DATA, 'mew').map((o) => o.id)).toEqual(['kaimuk', 'phueng', 'kong'])
    expect(ocsUsing(DATA, 'nobody')).toEqual([])
  })

  test('moving gives the new order, or nothing when the move is impossible', () => {
    const ids = ['a', 'b', 'c']
    expect(orderAfterMove(ids, 0, 1)).toEqual(['b', 'a', 'c'])
    expect(orderAfterMove(ids, 2, -1)).toEqual(['a', 'c', 'b'])
    expect(orderAfterMove(ids, 0, -1)).toBeNull()
    expect(orderAfterMove(ids, 2, 1)).toBeNull()
    expect(orderAfterMove(ids, 5, 1)).toBeNull()
    expect(ids).toEqual(['a', 'b', 'c'])
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

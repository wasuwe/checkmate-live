// เตือนเมื่อถึงตาผู้เล่น (เจ้าของโปรเจกต์ขอ 2026-11-26): ป้ายบนกระดาน แถบผู้เล่นกะพริบ
// สั่นบนมือถือ และชื่อแท็บเปลี่ยนเมื่อผู้เล่นอยู่หน้าต่างอื่น
// เสียงในเกม (เสียงวางหมาก ดู sound.ts) เปิด/ปิดได้ เก็บในเบราว์เซอร์ของแต่ละคน

import { useSyncExternalStore } from 'react'
import type { StateMsg } from './protocol'

/**
 * ตานี้เพิ่งเปลี่ยนมาเป็นของผู้เล่นคนนี้หรือไม่ (เทียบกับ state ก่อนหน้า)
 * ไม่นับ: state แรกหลังเข้าห้องหรือเชื่อมต่อใหม่ ผู้ชม เกมที่ไม่ได้เล่นอยู่
 * และหมากฮอสที่กินต่อ (ตายังเป็นของคนเดิม ไม่ใช่การเปลี่ยนตา)
 */
export function becameMyTurn(prev: StateMsg | null, next: StateMsg): boolean {
  const me = next.you.color
  if (!prev || me === '' || next.status !== 'playing' || next.turn !== me) return false
  if (prev.status === 'waiting') return true // เกมเพิ่งเริ่มและเราเดินก่อน
  return prev.status === 'playing' && prev.turn !== me && next.ply > prev.ply
}

// ---------- ค่าที่เลือก: เปิด/ปิดเสียง ----------

const STORAGE_KEY = 'checkmate.turnSound'
const listeners = new Set<() => void>()
let current: boolean | null = null

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

function getSnapshot(): boolean {
  current ??= read()
  return current
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

export function setTurnSound(on: boolean): void {
  current = on
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // เก็บไม่ได้ก็ใช้ได้จนปิดหน้า
  }
  for (const notify of listeners) notify()
}

/** เปิดเสียงในเกมอยู่หรือไม่ (ค่าเริ่มต้น: เปิด) */
export function useTurnSound(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}

export function turnSoundOn(): boolean {
  return getSnapshot()
}

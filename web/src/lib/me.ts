// ตัวตนของผู้ใช้ที่เปิดหน้าเว็บอยู่: login หรือไม่ และโปรไฟล์ (ชื่อ รูป) ถ้า login
// ทุกหน้าใช้ค่าชุดเดียวกัน จึงโหลดโปรไฟล์ครั้งเดียวต่อการ login

import { useSyncExternalStore } from 'react'
import { fetchProfile, saveName, type Profile } from './profile'
import { loginAvailable, onSessionChange } from './session'

export interface Me {
  /** ยังไม่รู้ว่า login อยู่หรือไม่ */
  loading: boolean
  /** null = ไม่ได้ login (เล่นแบบผู้เล่นรับเชิญ) */
  email: string | null
  /** ชื่อและรูป ว่างถ้าไม่ได้ login หรือยังไม่ได้ตั้ง */
  profile: Profile
}

const EMPTY: Profile = { name: '', avatar: '' }
export const GUEST_NAME = 'ผู้เล่นรับเชิญ'

/** ชื่อที่ผู้สมัครกรอกไว้แต่ยังบันทึกไม่ได้เพราะต้องยืนยันอีเมลก่อน จะบันทึกเมื่อ login ครั้งแรก */
const PENDING_NAME_KEY = 'checkmate.pendingName'

let state: Me = { loading: loginAvailable, email: null, profile: EMPTY }
const listeners = new Set<() => void>()
let started = false
let loadSeq = 0

function set(next: Me): void {
  state = next
  for (const notify of listeners) notify()
}

function takePendingName(): string {
  try {
    const name = localStorage.getItem(PENDING_NAME_KEY) ?? ''
    localStorage.removeItem(PENDING_NAME_KEY)
    return name
  } catch {
    return ''
  }
}

export function setPendingName(name: string): void {
  try {
    localStorage.setItem(PENDING_NAME_KEY, name)
  } catch {
    // เก็บไม่ได้: ผู้ใช้ตั้งชื่อเองในหน้าโปรไฟล์ได้ภายหลัง
  }
}

async function loadProfile(email: string): Promise<void> {
  const seq = ++loadSeq
  let profile = EMPTY
  try {
    profile = await fetchProfile()
    if (profile.name === '') {
      const pending = takePendingName()
      if (pending !== '') profile = await saveName(pending)
    }
  } catch {
    // โหลดไม่ได้: ยังใช้งานได้ แค่ไม่มีชื่อและรูป
  }
  if (seq === loadSeq) set({ loading: false, email, profile })
}

function start(): void {
  if (started) return
  started = true
  onSessionChange((email) => {
    if (email === null) {
      loadSeq++
      set({ loading: false, email: null, profile: EMPTY })
    } else if (email !== state.email || state.loading) {
      set({ loading: false, email, profile: state.email === email ? state.profile : EMPTY })
      void loadProfile(email)
    }
  })
}

function subscribe(onChange: () => void): () => void {
  start()
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

export function useMe(): Me {
  return useSyncExternalStore(subscribe, () => state)
}

/** หน้าโปรไฟล์เรียกหลังบันทึก เพื่อให้ทุกหน้าเห็นค่าใหม่ทันที */
export function setMyProfile(profile: Profile): void {
  if (state.email !== null) set({ ...state, profile })
}

/** ชื่อที่ใช้เรียกผู้ใช้คนนี้ */
export function myName(me: Me): string {
  if (me.email === null) return GUEST_NAME
  return me.profile.name || 'ผู้เล่น'
}

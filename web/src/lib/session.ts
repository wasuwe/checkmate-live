// การ login ผ่าน Supabase Auth
// ถ้าไม่ได้ตั้ง VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY แอปจะทำงานแบบ guest อย่างเดียว

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { getGuestToken } from './guest'
import { createTokenSource } from './tokenSource'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// anon key เป็นค่าสาธารณะ ส่วน service role key ต้องไม่มาอยู่ฝั่งเว็บเด็ดขาด
const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null

export const loginAvailable = supabase !== null

/** token ที่ใช้คุยกับ Go server (ทั้ง HTTP และ WebSocket) */
export const getToken = createTokenSource({ auth: supabase?.auth ?? null, guestToken: getGuestToken })

export interface SessionState {
  loading: boolean
  email: string | null
}

/** สถานะ login ปัจจุบัน อัปเดตเองเมื่อ login/logout (รวมถึงจากแท็บอื่น) */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ loading: supabase !== null, email: null })

  useEffect(() => {
    if (!supabase) return
    // onAuthStateChange ส่ง INITIAL_SESSION มาให้ทันทีหลัง subscribe
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ loading: false, email: session?.user.email ?? null })
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return state
}

/** เรียก callback ทุกครั้งที่สถานะ login เปลี่ยน (รวมค่าเริ่มต้น) คืนฟังก์ชันเลิกฟัง */
export function onSessionChange(callback: (email: string | null) => void): () => void {
  if (!supabase) {
    callback(null)
    return () => {}
  }
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session ? (session.user.email ?? '') : null)
  })
  return () => data.subscription.unsubscribe()
}

export type AuthResult = { ok: true; needsEmailConfirm: boolean } | { ok: false; message: string }

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  email_not_confirmed: 'ยังไม่ได้ยืนยันอีเมล เปิดลิงก์ในอีเมลที่ส่งไปก่อน',
  user_already_exists: 'อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบแทน',
  weak_password: 'รหัสผ่านสั้นหรือเดาง่ายเกินไป',
  over_email_send_rate_limit: 'ส่งอีเมลบ่อยเกินไป รอสักครู่แล้วลองใหม่',
  over_request_rate_limit: 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่',
  email_address_invalid: 'อีเมลไม่ถูกต้อง',
  signup_disabled: 'ระบบปิดรับสมัครสมาชิกอยู่',
}

function failure(error: { code?: string }): AuthResult {
  return { ok: false, message: MESSAGES[error.code ?? ''] ?? 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง' }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: 'ระบบสมาชิกยังไม่เปิดใช้งาน' }
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? failure(error) : { ok: true, needsEmailConfirm: false }
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: 'ระบบสมาชิกยังไม่เปิดใช้งาน' }
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return failure(error)
  // ถ้าโปรเจกต์เปิดการยืนยันอีเมล จะยังไม่ได้ session จนกว่าจะกดลิงก์ในอีเมล
  return { ok: true, needsEmailConfirm: data.session === null }
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut()
}

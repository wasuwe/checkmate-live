// ข้อความภาษาไทยที่แสดงให้ผู้เล่นเห็น

import { gameOf } from './games'
import type { Color, PlayerInfo, StateMsg } from './protocol'

const REASONS: Record<string, string> = {
  checkmate: 'Checkmate',
  resign: 'ยอมแพ้',
  timeout: 'หมดเวลา',
  stalemate: 'อับ (stalemate)',
  abandon: 'หลุดจากเกมเกินเวลา',
  draw: 'เสมอตามกติกา',
  count: 'นับศักดิ์ครบ',
  wipeout: 'กินหมากหมดกระดาน',
  blocked: 'ไม่มีตาเดินเหลือ',
}

/** เหตุผลที่เกมจบเป็นข้อความ บางเหตุผลมีความหมายต่างกันตามเกม (ใช้ทั้งในเกมและในประวัติเกม) */
export function reasonLabel(reason: string | undefined, game: string): string {
  // หมากหนีบชนะเมื่อคู่แข่งเหลือหมากไม่เกิน 2 ตัว ไม่ต้องกินจนหมด
  if (reason === 'wipeout' && game === 'neeb') return 'คู่แข่งเหลือหมากไม่เกิน 2 ตัว'
  return REASONS[reason ?? ''] ?? ''
}

function reasonText(state: StateMsg): string {
  return reasonLabel(state.reason, gameOf(state))
}

const ERRORS: Record<string, string> = {
  illegal_move: 'เดินแบบนี้ไม่ได้',
  not_your_turn: 'ยังไม่ถึงตาคุณ',
  stale_move: 'กระดานเปลี่ยนไปแล้ว ลองเดินใหม่',
  not_a_player: 'คุณเป็นผู้ชม เดินหมากไม่ได้',
  game_not_active: 'เกมนี้ไม่ได้อยู่ระหว่างเล่น',
  bad_message: 'ส่งข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง',
  rate_limited: 'ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่',
}

export function colorName(color: Color): string {
  return color === 'w' ? 'ขาว' : 'ดำ'
}

/** ชื่อที่ใช้เรียกผู้เล่นฝั่งหนึ่ง: ชื่อจากโปรไฟล์ถ้ามี ไม่งั้นบอกว่าเป็นผู้เล่นแบบไหน */
export function playerName(info: PlayerInfo | undefined, color: Color): string {
  if (!info) return colorName(color) // ยังไม่มีผู้เล่นนั่งฝั่งนี้
  if (info.name) return info.name
  return info.guest ? 'ผู้เล่นรับเชิญ' : 'ผู้เล่น'
}

export function errorText(code: string): string {
  return ERRORS[code] ?? 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง'
}

function winnerOf(result: string | undefined): Color | 'draw' | null {
  if (result === '1-0') return 'w'
  if (result === '0-1') return 'b'
  if (result === '1/2-1/2') return 'draw'
  return null
}

/** ข้อความสรุปผลเกม จากมุมของผู้ที่กำลังดูหน้าจอ */
export function resultText(state: StateMsg): string {
  const winner = winnerOf(state.result)
  const reason = reasonText(state)
  if (winner === null) return 'เกมจบแล้ว'
  if (winner === 'draw') return reason ? `เสมอ — ${reason}` : 'เสมอ'

  const you = state.you.color
  const headline =
    you === '' ? `${colorName(winner)}ชนะ` : you === winner ? 'คุณชนะ' : 'คุณแพ้'
  return reason ? `${headline} — ${reason}` : headline
}

/** ข้อความการนับศักดิ์ของหมากรุกไทย เช่น "นับศักดิ์หมาก 6/16" หรือ '' ถ้าไม่ได้นับอยู่ */
export function countText(state: StateMsg): string {
  const count = state.count
  if (!count || state.status !== 'playing') return ''
  if (count.kind === 'board') return `นับศักดิ์กระดาน ${count.n}/${count.limit}`
  const who = count.side ? ` (ฝ่าย${colorName(count.side)}นับ)` : ''
  return `นับศักดิ์หมาก ${count.n}/${count.limit}${who}`
}

/** ข้อความเตือนว่าต้องกิน (หมากฮอสบังคับกิน) แสดงเฉพาะกับผู้เล่นที่ถึงตา หรือ '' */
export function forcedText(state: StateMsg): string {
  if (!state.forced || state.status !== 'playing' || state.you.color !== state.turn) return ''
  return 'มีหมากให้กิน ต้องกินก่อน'
}

/** ข้อความสถานะหลักเหนือกระดาน */
export function statusText(state: StateMsg): string {
  switch (state.status) {
    case 'waiting':
      return 'รอคู่แข่งเข้าห้อง'
    case 'finished':
      return resultText(state)
    case 'playing': {
      const you = state.you.color
      if (you === '') return `ตาของ${colorName(state.turn)}`
      return you === state.turn ? 'ตาคุณเดิน' : 'รอคู่แข่งเดิน'
    }
  }
}

/** ผลเกมแยกเป็นส่วน ๆ สำหรับป็อปอัปจบเกม */
export function resultParts(state: StateMsg): {
  headline: string
  reason: string
  outcome: 'win' | 'loss' | 'draw' | 'watch'
} {
  const winner = winnerOf(state.result)
  const reason = reasonText(state)
  if (winner === null) return { headline: 'เกมจบแล้ว', reason, outcome: 'watch' }
  if (winner === 'draw') return { headline: 'เสมอ', reason, outcome: 'draw' }
  const you = state.you.color
  if (you === '') return { headline: `ฝ่าย${colorName(winner)}ชนะ`, reason, outcome: 'watch' }
  return you === winner
    ? { headline: 'คุณชนะ!', reason, outcome: 'win' }
    : { headline: 'คุณแพ้', reason, outcome: 'loss' }
}

/** รหัสห้อง 6 ตัวแบ่งเป็นสองกลุ่ม เช่น "K7Q 2XM" ให้อ่านและบอกต่อง่าย */
export function formatRoomCode(roomId: string): string {
  return roomId.replace(/(.{3})(?=.)/g, '$1 ')
}

export interface RematchView {
  /** ผู้ดูเป็นผู้เล่นของเกมที่เพิ่งจบ จึงกดเล่นต่อได้ */
  canAsk: boolean
  /** ผู้ดูกดเล่นต่อแล้ว กำลังรออีกฝ่าย */
  asked: boolean
  /** อีกฝ่ายกดเล่นต่อแล้ว กำลังรอผู้ดู */
  opponentAsked: boolean
  /** ข้อความบนปุ่ม และข้อความบอกสถานะ ('' = ไม่มี) */
  button: string
  note: string
}

/** สถานะการขอเล่นต่อหลังเกมจบ จากมุมของผู้ที่กำลังดูหน้าจอ (เกมใหม่เริ่มเมื่อผู้เล่นทั้งสองกด) */
export function rematchView(state: StateMsg): RematchView {
  const you = state.you.color
  const votes = state.rematch ?? []
  if (state.status !== 'finished' || you === '') {
    const note = state.status === 'finished' && votes.length > 0 ? `ฝ่าย${colorName(votes[0])}ขอเล่นต่อ รออีกฝ่ายตอบ` : ''
    return { canAsk: false, asked: false, opponentAsked: false, button: '', note }
  }
  const asked = votes.includes(you)
  const opponentAsked = votes.some((c) => c !== you)
  return {
    canAsk: true,
    asked,
    opponentAsked,
    button: asked ? 'รอคู่แข่งกดเล่นต่อ…' : 'เล่นต่อ',
    note: asked
      ? 'เกมใหม่จะเริ่มเมื่อคู่แข่งกดเล่นต่อด้วย แล้วสุ่มฝ่ายใหม่'
      : opponentAsked
        ? 'คู่แข่งอยากเล่นต่อ! กด "เล่นต่อ" เพื่อเริ่มเกมใหม่'
        : 'กด "เล่นต่อ" ทั้งสองคนเพื่อเริ่มเกมใหม่ในห้องนี้ ระบบจะสุ่มฝ่ายใหม่',
  }
}

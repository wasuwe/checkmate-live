// ข้อความภาษาไทยที่แสดงให้ผู้เล่นเห็น

import type { Color, StateMsg } from './protocol'

const REASONS: Record<string, string> = {
  checkmate: 'รุกจน',
  resign: 'ยอมแพ้',
  timeout: 'หมดเวลา',
  stalemate: 'อับ (stalemate)',
  abandon: 'หลุดจากเกมเกินเวลา',
  draw: 'เสมอตามกติกา',
}

const ERRORS: Record<string, string> = {
  illegal_move: 'เดินแบบนี้ไม่ได้',
  not_your_turn: 'ยังไม่ถึงตาคุณ',
  stale_move: 'กระดานเปลี่ยนไปแล้ว ลองเดินใหม่',
  not_a_player: 'คุณเป็นผู้ชม เดินหมากไม่ได้',
  game_not_active: 'เกมนี้ไม่ได้อยู่ระหว่างเล่น',
  bad_message: 'ส่งข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง',
}

export function colorName(color: Color): string {
  return color === 'w' ? 'ขาว' : 'ดำ'
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
  const reason = REASONS[state.reason ?? ''] ?? ''
  if (winner === null) return 'เกมจบแล้ว'
  if (winner === 'draw') return reason ? `เสมอ — ${reason}` : 'เสมอ'

  const you = state.you.color
  const headline =
    you === '' ? `${colorName(winner)}ชนะ` : you === winner ? 'คุณชนะ' : 'คุณแพ้'
  return reason ? `${headline} — ${reason}` : headline
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

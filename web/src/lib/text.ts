// ข้อความภาษาไทยที่แสดงให้ผู้เล่นเห็น

import { gameOf } from './games'
import type { Color, PlayerInfo, StateMsg } from './protocol'

const REASONS: Record<string, string> = {
  checkmate: 'Checkmate',
  resign: 'ยอมแพ้',
  timeout: 'หมดเวลา',
  stalemate: 'อับ',
  abandon: 'หลุดจากเกมนานเกินไป',
  draw: 'เสมอตามกติกา',
  count: 'นับศักดิ์ครบ',
  wipeout: 'กินหมากหมดกระดาน',
  blocked: 'ไม่มีตาให้เดิน',
}

/** เหตุผลที่เกมจบเป็นข้อความ บางเหตุผลมีความหมายต่างกันตามเกม (ใช้ทั้งในเกมและในประวัติเกม) */
export function reasonLabel(reason: string | undefined, game: string): string {
  // หมากหนีบชนะเมื่อคู่แข่งเหลือหมากไม่เกิน 2 ตัว ไม่ต้องกินจนหมด
  if (reason === 'wipeout' && game === 'neeb') return 'ฝ่ายแพ้เหลือหมากไม่เกิน 2 ตัว'
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
  game_not_active: 'เกมนี้ยังไม่เริ่มหรือจบไปแล้ว',
  bad_message: 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง',
  rate_limited: 'กดเร็วเกินไป รอสักครู่แล้วลองใหม่',
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
  return ERRORS[code] ?? 'มีบางอย่างผิดพลาด ลองใหม่อีกครั้ง'
}

function winnerOf(result: string | undefined): Color | 'draw' | null {
  if (result === '1-0') return 'w'
  if (result === '0-1') return 'b'
  if (result === '1/2-1/2') return 'draw'
  return null
}

type Outcome = 'win' | 'loss' | 'draw' | 'watch'

interface ResultParts {
  headline: string
  /** เหตุผลที่เกมจบ เขียนจากมุมของผู้ที่กำลังดูหน้าจอ เช่น "คู่แข่งหมดเวลา" หรือ '' */
  reason: string
  outcome: Outcome
}

const other = (color: Color): Color => (color === 'w' ? 'b' : 'w')

/**
 * เหตุผลที่ฝ่ายหนึ่งแพ้ เขียนให้รู้ว่าใครเป็นคนทำ `loser` คือคำเรียกฝ่ายที่แพ้:
 * "คู่แข่ง", "ฝ่ายขาว" หรือ "คุณ" เมื่อผู้ที่ดูอยู่เป็นฝ่ายแพ้เอง
 */
function lossReason(reason: string | undefined, game: string, loser: string): string {
  switch (reason) {
    case 'checkmate':
      return loser === 'คุณ' ? 'โดน Checkmate' : 'Checkmate'
    case 'resign':
      return `${loser}ยอมแพ้`
    case 'timeout':
      return `${loser}หมดเวลา`
    case 'abandon':
      return `${loser}หลุดจากเกมนานเกินไป`
    case 'blocked':
      return `${loser}ไม่มีตาให้เดิน`
    case 'wipeout':
      // หมากหนีบชนะเมื่อคู่แข่งเหลือหมากไม่เกิน 2 ตัว ไม่ต้องกินจนหมด
      return game === 'neeb' ? `${loser}เหลือหมากไม่เกิน 2 ตัว` : `หมากของ${loser}ถูกกินหมด`
    default:
      return reasonLabel(reason, game)
  }
}

/** ผลเกมแยกเป็นส่วน ๆ สำหรับป็อปอัปจบเกม */
export function resultParts(state: StateMsg): ResultParts {
  const winner = winnerOf(state.result)
  const game = gameOf(state)
  if (winner === null) return { headline: 'เกมจบแล้ว', reason: reasonText(state), outcome: 'watch' }
  if (winner === 'draw') {
    // "เสมอตามกติกา" ซ้ำกับหัวเรื่อง "เสมอ" จึงเหลือแค่ "ตามกติกา"
    return { headline: 'เสมอ', reason: state.reason === 'draw' ? 'ตามกติกา' : reasonText(state), outcome: 'draw' }
  }
  const you = state.you.color
  if (you === '') {
    return {
      headline: `ฝ่าย${colorName(winner)}ชนะ`,
      reason: lossReason(state.reason, game, `ฝ่าย${colorName(other(winner))}`),
      outcome: 'watch',
    }
  }
  return you === winner
    ? { headline: 'คุณชนะ!', reason: lossReason(state.reason, game, 'คู่แข่ง'), outcome: 'win' }
    : { headline: 'คุณแพ้', reason: lossReason(state.reason, game, 'คุณ'), outcome: 'loss' }
}

/**
 * ข้อความสรุปผลเกมบรรทัดเดียว จากมุมของผู้ที่กำลังดูหน้าจอ เขียนเป็นประโยคเดียว ไม่ใช้ขีดคั่น
 * เช่น "คุณชนะเพราะคู่แข่งหมดเวลา", "คุณชนะด้วย Checkmate", "คุณแพ้เพราะหมดเวลา", "คุณยอมแพ้", "เสมอตามกติกา"
 */
export function resultText(state: StateMsg): string {
  const { headline, reason, outcome } = resultParts(state)
  const head = headline.replace('!', '')
  if (!reason) return head
  if (outcome === 'draw') return state.reason === 'draw' ? 'เสมอตามกติกา' : `เสมอเพราะ${reason}`
  if (outcome === 'loss') {
    if (state.reason === 'resign') return reason
    // "คุณแพ้เพราะคุณหมดเวลา" ซ้ำคำ จึงตัด "คุณ" ในเหตุผลออก
    return `${head}เพราะ${reason.replace('หมากของคุณ', 'หมาก').replace(/^คุณ/, '')}`
  }
  if (state.reason === 'checkmate') return `${head}ด้วย Checkmate`
  return `${head}เพราะ${reason}`
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
      if (you === '') return `ตาฝ่าย${colorName(state.turn)}เดิน`
      return you === state.turn ? 'ตาคุณเดิน' : 'รอคู่แข่งเดิน'
    }
  }
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
  /** อีกฝ่ายออกจากห้องไปแล้ว (ไม่ได้เชื่อมต่ออยู่) จึงเล่นต่อไม่ได้จนกว่าจะกลับมา */
  opponentLeft: boolean
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
    return { canAsk: false, asked: false, opponentAsked: false, opponentLeft: false, button: '', note }
  }
  const asked = votes.includes(you)
  const opponentAsked = votes.some((c) => c !== you)
  // เจ้าของโปรเจกต์กำหนด: ถ้าอีกฝ่ายออกไปแล้ว ต้องบอกให้เห็น ไม่ปล่อยให้รอโดยไม่รู้
  const opponent = state.players?.[you === 'w' ? 'b' : 'w']
  if (opponent && !opponent.connected) {
    return {
      canAsk: true,
      asked,
      opponentAsked: false,
      opponentLeft: true,
      button: 'คู่แข่งออกไปแล้ว',
      note: 'คู่แข่งออกจากห้องไปแล้ว เล่นต่อในห้องนี้ไม่ได้ ถ้าอยากเล่นอีกให้สร้างห้องใหม่',
    }
  }
  return {
    canAsk: true,
    asked,
    opponentAsked,
    opponentLeft: false,
    button: asked ? 'รอคู่แข่ง…' : 'เล่นต่อ',
    note: asked
      ? 'พอคู่แข่งกดเล่นต่อด้วย เกมใหม่จะเริ่มและสุ่มฝ่ายใหม่'
      : opponentAsked
        ? 'คู่แข่งชวนเล่นต่อ กดปุ่มด้านล่างเพื่อเริ่มเลย'
        : 'ถ้ากดเล่นต่อทั้งสองคน เกมใหม่จะเริ่มในห้องนี้และสุ่มฝ่ายใหม่',
  }
}

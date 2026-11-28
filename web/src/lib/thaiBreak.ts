// กันไม่ให้เบราว์เซอร์ตัดบรรทัดกลางคำประสมภาษาไทย
//
// เบราว์เซอร์ตัดบรรทัดไทยด้วยพจนานุกรมของตัวเอง ซึ่งแยกคำประสมเป็นคำย่อย ("เจ้า|ป่า", "หมาก|รุก", "ผู้|เล่น")
// คำพวกนี้จึงถูกตัดขึ้นคนละบรรทัดได้ ฟังก์ชันนี้ใส่ตัวเชื่อมคำ (U+2060 มองไม่เห็น และห้ามตัดบรรทัดตรงนั้น) ไว้ที่รอยต่อข้างในคำ
// รายการคำมาจาก thaiCompounds.ts ซึ่งสร้างด้วย scripts/thai-compounds.mjs (ตัวตัดคำ OpenThai2.0-LATTE-WordSeg-Lite)
//
// ใช้กับข้อความยาวที่เบราว์เซอร์ตัดบรรทัดเอง (หน้ากติกา ข้อตกลง คำอธิบายหมาก) ข้อความสั้นที่เป็นจุดเด่นกำหนดจุดขึ้นบรรทัดเองดีกว่า
// (ดู FABLE_LINES) เพราะตัวตัดคำรู้แค่ขอบเขตของคำ ไม่รู้ว่าตัดตรงไหนแล้วอ่านลื่น

import { THAI_COMPOUNDS } from './thaiCompounds'

/** ตัวเชื่อมคำ: ไม่มีความกว้าง และห้ามตัดบรรทัดทั้งก่อนและหลัง */
export const WORD_JOINER = '⁠'

/** คำประสมแต่ละคำ กับตำแหน่งรอยต่อข้างในคำ (นับจากต้นคำ) ที่เบราว์เซอร์จะตัดบรรทัดได้ */
const COMPOUNDS = THAI_COMPOUNDS.map((c) => {
  const cuts: number[] = []
  let at = 0
  for (const part of c.split('|').slice(0, -1)) cuts.push((at += part.length))
  return { word: c.replaceAll('|', ''), cuts }
})

/**
 * ข้อความเดิมที่ใส่ตัวเชื่อมคำไว้ในคำประสม หน้าตาเหมือนเดิมทุกอย่าง ต่างกันแค่จุดที่ยอมให้ขึ้นบรรทัดใหม่
 * คำที่ซ้อนเหลื่อมกันถูกป้องกันทั้งคู่ ("เดินหมากรุก" มีทั้ง "เดินหมาก" และ "หมากรุก"): เก็บทุกตำแหน่งที่ต้องปิดก่อน แล้วค่อยใส่ทีเดียว
 */
export function keepThaiWords(text: string): string {
  const closed = new Set<number>()
  for (const { word, cuts } of COMPOUNDS) {
    for (let from = text.indexOf(word); from !== -1; from = text.indexOf(word, from + 1)) {
      for (const cut of cuts) closed.add(from + cut)
    }
  }
  if (closed.size === 0) return text
  let out = ''
  for (let i = 0; i < text.length; i++) out += (closed.has(i) ? WORD_JOINER : '') + text[i]
  return out
}

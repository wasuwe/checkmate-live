// สร้างรายการคำประสมภาษาไทยที่ต้องอยู่บรรทัดเดียวกัน → src/lib/thaiCompounds.ts
//
// ทำไม: เบราว์เซอร์ตัดบรรทัดภาษาไทยด้วยพจนานุกรมของตัวเอง ซึ่งแยกคำประสมเป็นคำย่อย ("เจ้า|ป่า", "กระ|ดาน", "หมาก|รุก")
// คำพวกนี้จึงถูกตัดขึ้นคนละบรรทัดได้ สคริปต์นี้ใช้ตัวตัดคำ OpenThai2.0-LATTE-WordSeg-Lite (หน่วย long ซึ่งเก็บคำประสมไว้เป็นคำเดียว)
// อ่านข้อความไทยทั้งหมดในหน้าเว็บ แล้วเก็บคำที่ตัวตัดคำของเบราว์เซอร์จะแยก รายการที่ได้ถูกใช้โดย lib/thaiBreak.ts
//
// เป็นเครื่องมือตอนพัฒนา ไม่อยู่ในขั้นตอน build: รันใหม่เมื่อข้อความยาวในเว็บเปลี่ยน แล้วตรวจรายการด้วยตาก่อน commit
// (โมเดลตัดคำผิดได้) ต้องมี Python ที่ติดตั้งตัวตัดคำไว้:
//   pip install https://huggingface.co/iapp/OpenThai2.0-LATTE-WordSeg-Lite/resolve/main/openthai2_0_latte_wordseg_lite-0.1.2-py3-none-any.whl
// ใช้:  node scripts/thai-compounds.mjs [path ของ python]        (รันจากโฟลเดอร์ web)
// โมเดลและพจนานุกรมเป็น CC BY-SA 4.0 ของ iApp Technology
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const python = process.argv[2] ?? 'python'
const SRC = new URL('../src/', import.meta.url)

/** ไฟล์ซอร์สทั้งหมดที่มีข้อความให้ผู้ใช้เห็น (ไม่รวมชุดทดสอบ) */
function sources(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...sources(path))
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && name !== 'thaiCompounds.ts') out.push(path)
  }
  return out
}

// ช่วงตัวอักษรไทยที่ติดกันในทุกบรรทัดที่ไม่ใช่คอมเมนต์
const runs = new Set()
for (const file of sources(SRC.pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*')) continue
    const code = line.replace(/\/\/.*$/, '')
    for (const run of code.match(/[฀-๿]{4,}/g) ?? []) runs.add(run)
  }
}

// ตัดคำด้วย LATTE (หน่วย long) ผ่าน Python: รับช่วงตัวอักษรทาง stdin คืนคำที่ไม่ซ้ำเป็น JSON
const script = `
import json, sys
from openthai_latte_wordseg_lite import tokenize
words = set()
for run in json.loads(sys.stdin.buffer.read().decode("utf-8")):  # อ่านเป็น UTF-8 เสมอ ไม่ขึ้นกับภาษาของเครื่อง
    for w in tokenize(run, unit="long"):
        if len(w) >= 4:
            words.add(w)
sys.stdout.buffer.write(json.dumps(sorted(words), ensure_ascii=True).encode())
`
const result = spawnSync(python, ['-c', script], { input: JSON.stringify([...runs]), encoding: 'utf8', maxBuffer: 1 << 26 })
if (result.status !== 0) {
  console.error(result.stderr || result.error)
  process.exit(1)
}
const words = JSON.parse(result.stdout)

// คำที่ตัวตัดคำของเบราว์เซอร์ (ICU) แยกเป็นหลายคำ = คำที่อาจถูกตัดกลาง เก็บพร้อมจุดที่เบราว์เซอร์จะตัด (|)
const icu = new Intl.Segmenter('th', { granularity: 'word' })
const compounds = []
for (const word of words) {
  if (!/^[฀-๿]+$/.test(word) || word.length > 18) continue
  const parts = [...icu.segment(word)].map((s) => s.segment)
  if (parts.length > 1) compounds.push(parts.join('|'))
}
compounds.sort((a, b) => a.localeCompare(b, 'th'))

const body = `// สร้างโดย scripts/thai-compounds.mjs ห้ามแก้ด้วยมือ (รันสคริปต์ใหม่เมื่อข้อความในเว็บเปลี่ยน)
// คำประสมภาษาไทยที่ตัวตัดบรรทัดของเบราว์เซอร์จะแยกเป็นคำย่อย เครื่องหมาย | คือจุดที่เบราว์เซอร์จะตัด ซึ่ง lib/thaiBreak.ts ปิดไว้
// ได้จากตัวตัดคำ OpenThai2.0-LATTE-WordSeg-Lite ของ iApp Technology (CC BY-SA 4.0)

export const THAI_COMPOUNDS: readonly string[] = [
${compounds.map((c) => `  '${c}',`).join('\n')}
]
`
writeFileSync(new URL('lib/thaiCompounds.ts', SRC), body)
console.log(`ช่วงข้อความไทย ${runs.size} ช่วง, คำจาก LATTE ${words.length} คำ, คำประสมที่เบราว์เซอร์จะแยก ${compounds.length} คำ`)

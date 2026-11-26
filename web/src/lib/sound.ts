// เสียงวางหมากไม้บนกระดาน (เจ้าของโปรเจกต์ขอให้เหมือนเดินหมากจริง 2026-11-27)
// สังเคราะห์ด้วย Web Audio ไม่มีไฟล์เสียง: เสียง "ก๊อก" ของไม้กระทบไม้ประกอบจาก
//   1) เสียงกระทบสั้นมาก (สัญญาณรบกวนผ่านตัวกรองช่วงกลางสูง) = ขอบหมากกระแทกกระดาน
//   2) เสียงก้องของเนื้อไม้ (คลื่นความถี่กลางที่ดับเร็ว) = เสียง "ก๊อก"
//   3) เสียงทุ้มของกระดาน (ความถี่ต่ำที่ตกลงเร็ว) = น้ำหนักของตัวหมาก
// ทุกครั้งสุ่มระดับเสียงเล็กน้อย ให้ไม่ซ้ำกันเป๊ะเหมือนของจริง

export type MoveSound = 'move' | 'capture'

let ctx: AudioContext | null = null
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()

function noiseFor(ac: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ac)
  if (!buf) {
    buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * 0.08), ac.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    noiseCache.set(ac, buf)
  }
  return buf
}

/** ค่าที่ทำให้เสียงแต่ละครั้งต่างกันเล็กน้อย (0.94–1.06) */
const vary = () => 0.94 + Math.random() * 0.12

/** เสียงหมากหนึ่งครั้งที่เวลา `at` ความแรง `force` (1 = วางปกติ) และระดับเสียง `pitch` */
function knock(ac: BaseAudioContext, out: AudioNode, at: number, force: number, pitch: number): void {
  // 1) เสียงกระทบ
  const noise = ac.createBufferSource()
  noise.buffer = noiseFor(ac)
  const band = ac.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 2400 * pitch
  band.Q.value = 1.6
  const hitGain = ac.createGain()
  hitGain.gain.setValueAtTime(0.0001, at)
  hitGain.gain.exponentialRampToValueAtTime(0.9 * force, at + 0.002)
  hitGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.035)
  noise.connect(band).connect(hitGain).connect(out)
  noise.start(at)
  noise.stop(at + 0.06)

  // 2) เนื้อไม้ "ก๊อก": สองความถี่ที่ไม่ลงตัวกันแบบไม้จริง ดับใน ~70ms
  for (const [freq, level, decay] of [
    [920, 0.5, 0.07],
    [1530, 0.22, 0.045],
  ] as const) {
    const osc = ac.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq * pitch, at)
    osc.frequency.exponentialRampToValueAtTime(freq * pitch * 0.96, at + decay)
    const g = ac.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(level * force, at + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay)
    osc.connect(g).connect(out)
    osc.start(at)
    osc.stop(at + decay + 0.02)
  }

  // 3) เสียงทุ้มของกระดาน
  const body = ac.createOscillator()
  body.type = 'sine'
  body.frequency.setValueAtTime(190 * pitch, at)
  body.frequency.exponentialRampToValueAtTime(110 * pitch, at + 0.09)
  const bg = ac.createGain()
  bg.gain.setValueAtTime(0.0001, at)
  bg.gain.exponentialRampToValueAtTime(0.55 * force, at + 0.004)
  bg.gain.exponentialRampToValueAtTime(0.0001, at + 0.11)
  body.connect(bg).connect(out)
  body.start(at)
  body.stop(at + 0.13)
}

/**
 * วาดเสียงลงใน context ใดก็ได้ (ใช้ OfflineAudioContext ใน test เพื่อวัดเสียงจริงได้)
 * การกิน: หมากที่ถูกกินกระทบเบา ๆ ก่อน แล้วหมากที่เดินวางลงหนักกว่าปกติ
 */
export function renderMoveSound(ac: BaseAudioContext, kind: MoveSound, at = ac.currentTime): void {
  const master = ac.createGain()
  master.gain.value = 0.55
  // ตัดเสียงต่ำมากและแหลมมากที่ลำโพงเล็กเล่นไม่ได้ ให้ฟังเป็นไม้ไม่ใช่เสียงหึ่ง
  const shape = ac.createBiquadFilter()
  shape.type = 'highpass'
  shape.frequency.value = 80
  master.connect(shape).connect(ac.destination)
  if (kind === 'capture') {
    knock(ac, master, at, 0.45, 1.12 * vary())
    knock(ac, master, at + 0.075, 1.25, 0.92 * vary())
  } else {
    knock(ac, master, at, 1, vary())
  }
}

/** เล่นเสียงหมาก เบราว์เซอร์ที่ไม่ยอมเล่นเสียงจะเงียบไปเฉย ๆ */
export function playMoveSound(kind: MoveSound): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    ctx ??= new Ctx()
    if (ctx.state === 'suspended') void ctx.resume()
    renderMoveSound(ctx, kind)
  } catch {
    // ไม่มีเสียงก็เล่นต่อได้
  }
}

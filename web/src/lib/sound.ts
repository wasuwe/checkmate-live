// เสียงหมากเคาะกระดาน (เจ้าของโปรเจกต์ขอให้เหมือนเดินหมากจริง 2026-11-27)
// รอบแรกเป็น "ต๊อก" แหลมเกินไป รอบสองเป็น "ปัก" สองจังหวะตอนกิน แล้วเจ้าของโปรเจกต์ขอ "จังหวะเดียวพอ แต่แน่นกว่านี้"
// จึงมีหลายแบบให้เลือก (KNOCK_STYLES) ทุกแบบเป็นจังหวะเดียว การกินแค่หนักกว่าการเดินธรรมดา
//
// สังเคราะห์ด้วย Web Audio ไม่มีไฟล์เสียง เสียงหนึ่งครั้งประกอบจาก
//   1) เสียงกระแทกสั้น (สัญญาณรบกวนผ่านตัวกรอง) = ฐานหมากกระแทกกระดาน
//   2) เสียงเนื้อไม้ (ความถี่กลางที่ดับเร็ว) = ตัวเสียง "ปัก"
//   3) เสียงทุ้มของกระดาน (ความถี่ต่ำที่ตกลงเร็ว) = น้ำหนักของตัวหมาก
// แล้วบีบเสียง (compressor) ให้ทุกส่วนดังมาพร้อมกันเป็นก้อนเดียว ซึ่งทำให้ฟังแน่น

export type MoveSound = 'move' | 'capture'

export interface KnockStyle {
  id: string
  name: string
  desc: string
  /** เสียงกระแทก: ความถี่กลางของตัวกรอง ความกว้าง ความดัง และเวลาดับ (วินาที) */
  click: { freq: number; q: number; gain: number; decay: number }
  /** เสียงเนื้อไม้: [ความถี่, ความดัง, เวลาดับ] */
  partials: [number, number, number][]
  /** เสียงทุ้ม: ความถี่เริ่ม → จบ ความดัง เวลาดับ */
  thump: { from: number; to: number; gain: number; decay: number }
  /** ตัดเสียงที่สูงกว่านี้ทิ้ง (ยิ่งต่ำยิ่งทึบ) */
  lowpass: number
}

export const KNOCK_STYLES: KnockStyle[] = [
  {
    id: 'solid',
    name: 'ไม้หนาแน่น',
    desc: 'หมากไม้หนักวางบนกระดานไม้หนา ทุ้มและแน่น',
    click: { freq: 900, q: 0.7, gain: 1.4, decay: 0.022 },
    partials: [
      [430, 0.7, 0.04],
      [960, 0.18, 0.022],
    ],
    thump: { from: 140, to: 70, gain: 1.0, decay: 0.07 },
    lowpass: 1800,
  },
  {
    id: 'hard',
    name: 'ไม้เนื้อแข็ง',
    desc: 'คมและกระชับกว่า เหมือนหมากไม้เนื้อแข็งเคาะกระดาน',
    click: { freq: 1500, q: 0.9, gain: 1.3, decay: 0.016 },
    partials: [
      [640, 0.65, 0.032],
      [1420, 0.2, 0.018],
    ],
    thump: { from: 170, to: 90, gain: 0.75, decay: 0.05 },
    lowpass: 2600,
  },
  {
    id: 'heavy',
    name: 'หนักทุ้ม',
    desc: 'หมากถ่วงน้ำหนักบนโต๊ะ เสียงต่ำและหนักที่สุด',
    click: { freq: 650, q: 0.6, gain: 1.2, decay: 0.026 },
    partials: [[300, 0.75, 0.05]],
    thump: { from: 115, to: 55, gain: 1.25, decay: 0.09 },
    lowpass: 1300,
  },
  {
    id: 'pak',
    name: 'ปักสั้น',
    desc: 'สั้นและแห้งที่สุด ได้ยินชัดแม้เปิดเบา ๆ',
    click: { freq: 1100, q: 0.8, gain: 1.5, decay: 0.014 },
    partials: [
      [520, 0.6, 0.025],
      [1180, 0.14, 0.015],
    ],
    thump: { from: 160, to: 85, gain: 0.85, decay: 0.045 },
    lowpass: 2200,
  },
]

export const DEFAULT_KNOCK = KNOCK_STYLES[0].id

export function knockById(id: string | undefined): KnockStyle {
  return KNOCK_STYLES.find((k) => k.id === id) ?? KNOCK_STYLES[0]
}

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

/** ค่าที่ทำให้เสียงแต่ละครั้งต่างกันเล็กน้อย (0.95–1.05) */
const vary = () => 0.95 + Math.random() * 0.1

/** เสียงหมากหนึ่งครั้งที่เวลา `at` ความแรง `force` (1 = วางปกติ) และระดับเสียง `pitch` */
function knock(ac: BaseAudioContext, out: AudioNode, style: KnockStyle, at: number, force: number, pitch: number): void {
  const env = (gain: number, attack: number, decay: number) => {
    const g = ac.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(gain * force, at + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay)
    return g
  }

  // 1) เสียงกระแทก
  const noise = ac.createBufferSource()
  noise.buffer = noiseFor(ac)
  const band = ac.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = style.click.freq * pitch
  band.Q.value = style.click.q
  noise.connect(band).connect(env(style.click.gain, 0.0012, style.click.decay)).connect(out)
  noise.start(at)
  noise.stop(at + style.click.decay + 0.02)

  // 2) เนื้อไม้
  for (const [freq, level, decay] of style.partials) {
    const osc = ac.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq * pitch, at)
    osc.frequency.exponentialRampToValueAtTime(freq * pitch * 0.95, at + decay)
    osc.connect(env(level, 0.002, decay)).connect(out)
    osc.start(at)
    osc.stop(at + decay + 0.02)
  }

  // 3) เสียงทุ้มของกระดาน
  const body = ac.createOscillator()
  body.type = 'sine'
  body.frequency.setValueAtTime(style.thump.from * pitch, at)
  body.frequency.exponentialRampToValueAtTime(style.thump.to * pitch, at + style.thump.decay * 0.8)
  body.connect(env(style.thump.gain, 0.0025, style.thump.decay)).connect(out)
  body.start(at)
  body.stop(at + style.thump.decay + 0.02)
}

/**
 * วาดเสียงลงใน context ใดก็ได้ (ใช้ OfflineAudioContext ใน test และตอนทำไฟล์ตัวอย่าง)
 * จังหวะเดียวเสมอ การกินเคาะหนักกว่าและต่ำกว่าการเดินธรรมดาเล็กน้อย
 */
export function renderMoveSound(ac: BaseAudioContext, kind: MoveSound, at = ac.currentTime, styleId?: string): void {
  const style = knockById(styleId)
  const master = ac.createGain()
  master.gain.value = 0.7
  const low = ac.createBiquadFilter()
  low.type = 'highpass'
  low.frequency.value = 45
  const dull = ac.createBiquadFilter()
  dull.type = 'lowpass'
  dull.frequency.value = style.lowpass
  dull.Q.value = 0.5
  // บีบเสียงเร็ว ๆ ให้ส่วนต่าง ๆ รวมเป็นก้อนเดียว (แน่น) และกันเสียงแตก
  const squeeze = ac.createDynamicsCompressor()
  squeeze.threshold.value = -22
  squeeze.knee.value = 6
  squeeze.ratio.value = 6
  squeeze.attack.value = 0.001
  squeeze.release.value = 0.06
  const makeup = ac.createGain()
  makeup.gain.value = 1.6
  master.connect(low).connect(dull).connect(squeeze).connect(makeup).connect(ac.destination)
  if (kind === 'capture') knock(ac, master, style, at, 1.3, 0.92 * vary())
  else knock(ac, master, style, at, 1, vary())
}

/** เล่นเสียงหมาก เบราว์เซอร์ที่ไม่ยอมเล่นเสียงจะเงียบไปเฉย ๆ */
export function playMoveSound(kind: MoveSound, styleId?: string): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    ctx ??= new Ctx()
    if (ctx.state === 'suspended') void ctx.resume()
    renderMoveSound(ctx, kind, ctx.currentTime, styleId)
  } catch {
    // ไม่มีเสียงก็เล่นต่อได้
  }
}

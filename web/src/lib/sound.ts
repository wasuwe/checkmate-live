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

/** แบบที่เจ้าของโปรเจกต์เลือก (2026-11-27): ปักสั้น */
export const DEFAULT_KNOCK = 'pak'

export function knockById(id: string | undefined): KnockStyle {
  return KNOCK_STYLES.find((k) => k.id === (id ?? DEFAULT_KNOCK)) ?? KNOCK_STYLES.find((k) => k.id === DEFAULT_KNOCK)!
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

// ---------- เสียงคนเข้าห้อง: ประตูเปิดแล้วกระดิ่งประตูดัง (เจ้าของโปรเจกต์ขอ 2026-11-27) ----------
// ดังเมื่อคู่แข่งหรือผู้ชมเข้าห้อง ประกอบจาก
//   1) กลอนประตู: เสียงกระแทกสั้นทุ้ม
//   2) บานพับ: เสียงเอี๊ยดสั้น ๆ ที่ระดับเสียงไต่ขึ้น
//   3) กระดิ่งหน้าร้าน: เคาะสามครั้งไล่กัน แต่ละครั้งเป็นเสียงโลหะหลายความถี่ที่ค่อย ๆ จาง

/** ความถี่ย่อยของกระดิ่งเทียบกับความถี่หลัก และความดังของแต่ละตัว */
const BELL_PARTIALS: [number, number][] = [
  [1, 1],
  [2.76, 0.5],
  [5.4, 0.25],
  [8.93, 0.12],
]

/** เวลา (วินาทีหลังประตูเริ่มเปิด) ความถี่หลัก และความดังของกระดิ่งแต่ละครั้ง */
const BELL_STRIKES: [number, number, number][] = [
  [0.3, 2090, 0.3],
  [0.46, 2480, 0.24],
  [0.6, 2090, 0.16],
]

/** ความยาวของเสียงทั้งหมดเป็นวินาที */
export const DOOR_SOUND_SECONDS = 1.9

/** วาดเสียงประตูกับกระดิ่งลงใน context ใดก็ได้ */
export function renderDoorSound(ac: BaseAudioContext, at = ac.currentTime): void {
  const master = ac.createGain()
  master.gain.value = 0.55
  master.connect(ac.destination)

  // 1) กลอนประตู
  const latch = ac.createBufferSource()
  latch.buffer = noiseFor(ac)
  const latchBand = ac.createBiquadFilter()
  latchBand.type = 'bandpass'
  latchBand.frequency.value = 520
  latchBand.Q.value = 0.8
  const latchGain = ac.createGain()
  latchGain.gain.setValueAtTime(0.0001, at)
  latchGain.gain.exponentialRampToValueAtTime(0.9, at + 0.003)
  latchGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05)
  latch.connect(latchBand).connect(latchGain).connect(master)
  latch.start(at)
  latch.stop(at + 0.07)

  // 2) บานพับเอี๊ยด: คลื่นฟันเลื่อยผ่านตัวกรองแคบ ระดับเสียงไต่ขึ้นและสั่นเล็กน้อย
  const creak = ac.createOscillator()
  creak.type = 'sawtooth'
  creak.frequency.setValueAtTime(95, at + 0.03)
  creak.frequency.linearRampToValueAtTime(170, at + 0.3)
  const wobble = ac.createOscillator()
  wobble.frequency.value = 23
  const wobbleDepth = ac.createGain()
  wobbleDepth.gain.value = 9
  wobble.connect(wobbleDepth).connect(creak.frequency)
  const creakBand = ac.createBiquadFilter()
  creakBand.type = 'bandpass'
  creakBand.frequency.setValueAtTime(700, at + 0.03)
  creakBand.frequency.linearRampToValueAtTime(1300, at + 0.3)
  creakBand.Q.value = 5
  const creakGain = ac.createGain()
  creakGain.gain.setValueAtTime(0.0001, at + 0.03)
  creakGain.gain.exponentialRampToValueAtTime(0.22, at + 0.1)
  creakGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.34)
  creak.connect(creakBand).connect(creakGain).connect(master)
  for (const osc of [creak, wobble]) {
    osc.start(at + 0.03)
    osc.stop(at + 0.36)
  }

  // 3) กระดิ่ง
  for (const [delay, base, level] of BELL_STRIKES) {
    const start = at + delay
    for (const [ratio, part] of BELL_PARTIALS) {
      const osc = ac.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = base * ratio
      const gain = ac.createGain()
      // ความถี่สูงจางเร็วกว่า เหมือนโลหะจริง
      const decay = 1.1 / Math.sqrt(ratio)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(level * part, start + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + decay)
      osc.connect(gain).connect(master)
      osc.start(start)
      osc.stop(start + decay + 0.02)
    }
  }
}

/** เล่นเสียงประตูกับกระดิ่ง เบราว์เซอร์ที่ไม่ยอมเล่นเสียงจะเงียบไปเฉย ๆ */
export function playDoorSound(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    ctx ??= new Ctx()
    if (ctx.state === 'suspended') void ctx.resume()
    renderDoorSound(ctx, ctx.currentTime)
  } catch {
    // ไม่มีเสียงก็เล่นต่อได้
  }
}

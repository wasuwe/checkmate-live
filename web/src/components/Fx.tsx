import type { CSSProperties, JSX } from 'react'
import { seeded, type FxType } from '../lib/fx'

// สไตล์นิทาน: ทอง งาช้าง ฟ้าคราม และกุหลาบ ไม่มีเส้นขอบหนา ใช้แสงเรืองแทน
const COLORS = ['#F2CF6E', '#FFF6DC', '#A9B3E6', '#E3B2BC', '#D8B56C', '#FFFFFF']
const NIGHT = '#1E2A6B'
const GLOW = '0 0 8px rgba(255, 216, 107, 0.95), 0 0 2px rgba(120, 80, 20, 0.8)'

type Vars = CSSProperties & Record<'--dx' | '--dy' | '--rot', string | undefined>

/** ความอลังการ: 1 = กินหมาก, 2 = Check, 3 = Checkmate แต่ละขั้นมีชิ้นส่วนมากขึ้น กระจายไกลขึ้น และเล่นหลายระลอก */
export type FxLevel = 1 | 2 | 3

/** ระลอกของแต่ละขั้น: จำนวนชิ้นต่อระลอก เวลาเริ่ม (วินาที) และระยะเป็นเท่าของ dist */
const WAVES: Record<FxLevel, { count: number; at: number; reach: number }[]> = {
  1: [
    { count: 16, at: 0, reach: 0.75 },
    { count: 20, at: 0.14, reach: 1.25 },
  ],
  2: [
    { count: 18, at: 0, reach: 0.8 },
    { count: 24, at: 0.16, reach: 1.35 },
    { count: 28, at: 0.38, reach: 1.9 },
  ],
  3: [
    { count: 24, at: 0, reach: 0.8 },
    { count: 30, at: 0.25, reach: 1.3 },
    { count: 36, at: 0.55, reach: 1.8 },
    { count: 40, at: 0.9, reach: 2.3 },
  ],
}

const RINGS: Record<FxLevel, number> = { 1: 4, 2: 5, 3: 7 }

interface Props {
  type: FxType
  /** ค่าที่ต่างกันให้รูปแบบการกระจายต่างกัน */
  seed: number
  /** ระยะที่ชิ้นส่วนกระจายออกไป (พิกเซล) */
  dist: number
  /** ความอลังการ (ค่าเริ่มต้น 1) */
  level?: FxLevel
  /** หน่วงเวลาเริ่มทั้งชุด (วินาที) ใช้ทำพลุหลายลูกไล่กัน */
  delay?: number
  /** ป้ายข้อความกลางเอฟเฟกต์ เช่น "Check!" */
  banner?: string
  /** ขนาดตัวอักษรของป้าย (ตัวเลข = พิกเซล หรือค่า CSS เช่น min(84px, 15cqw)) */
  bannerSize?: number | string
  /** ความยาวของการเคลื่อนไหวของป้าย (วินาที) */
  bannerSeconds?: number
}

/** ชิ้นส่วนของเอฟเฟกต์หนึ่งครั้ง กระจายออกจากกึ่งกลางของกล่องที่ครอบอยู่ เป็นของประดับล้วน ๆ */
export function FxBurst({ type, seed, dist, level = 1, delay = 0, banner, bannerSize = 54, bannerSeconds = 1.5 }: Props): JSX.Element {
  const parts: JSX.Element[] = []
  const waves = type === 'none' ? [] : type === 'ring' ? [{ count: RINGS[level], at: 0, reach: 1 + (level - 1) * 0.35 }] : WAVES[level]

  waves.forEach((wave, w) => {
    for (let i = 0; i < wave.count; i++) {
      const n = w * 100 + i
      const r1 = seeded(seed + n)
      const r2 = seeded(seed + n + 50)
      const angle = (i / wave.count) * Math.PI * 2 + r1 * 0.6 + w * 0.4
      const reach = dist * wave.reach
      const d = reach * (0.65 + r2 * 0.45)
      let style: Vars
      let text: string | null = null
      let wait = wave.at + delay

      switch (type) {
        case 'stars':
          text = '✦' // ดาวสี่แฉกแบบฉากเวที
          style = {
            fontSize: dist * (0.3 + r2 * 0.16),
            color: COLORS[i % 3],
            textShadow: GLOW,
            '--dx': `${Math.cos(angle) * d}px`,
            '--dy': `${Math.sin(angle) * d}px`,
            '--rot': `${r1 * 360}deg`,
            animation: 'fxBurst .95s cubic-bezier(.2,.8,.3,1) both',
          }
          break
        case 'hearts': {
          // กลีบกุหลาบลอยขึ้น (id ยังเป็น hearts เพื่อให้ค่าที่เคยเลือกไว้ใช้ได้)
          const size = dist * (0.16 + r2 * 0.14)
          style = {
            width: size,
            height: size * 1.3,
            borderRadius: '50% 0 50% 0',
            background: `linear-gradient(135deg, ${i % 2 ? '#F6D7DD' : '#FFF6DC'}, ${i % 2 ? '#A3445A' : '#C77B86'})`,
            border: '1px solid rgba(110, 30, 58, 0.45)',
            boxShadow: '0 0 6px rgba(255, 226, 140, 0.6)',
            '--dx': `${(r1 - 0.5) * reach * 1.6}px`,
            '--dy': `${-reach * (0.7 + r2 * 0.7)}px`,
            '--rot': undefined,
            animation: 'fxRise 1.25s ease-out both',
          }
          wait += i * 0.03
          break
        }
        case 'confetti':
          style = {
            width: dist * 0.12,
            height: dist * 0.22,
            borderRadius: 2,
            background: COLORS[i % 5],
            boxShadow: '0 0 4px rgba(255, 226, 140, 0.7)',
            '--dx': `${Math.cos(angle) * d}px`,
            '--dy': `${Math.sin(angle) * d + reach * 0.35}px`,
            '--rot': `${r1 * 720 - 360}deg`,
            animation: 'fxBurst 1.15s cubic-bezier(.2,.8,.3,1) both',
          }
          break
        case 'bubbles': {
          const size = dist * (0.14 + r2 * 0.2)
          style = {
            width: size,
            height: size,
            borderRadius: '50%', // หิ่งห้อย: ลูกแสงทองเรืองลอยขึ้น
            background: 'radial-gradient(circle, #FFFBE8 0 22%, #F2CF6E 40%, #C9973A 55%, rgba(201, 151, 58, 0) 72%)',
            boxShadow: '0 0 14px rgba(255, 196, 70, 0.85)',
            '--dx': `${(r1 - 0.5) * reach * 1.8}px`,
            '--dy': `${-reach * (0.6 + r2 * 0.8)}px`,
            '--rot': undefined,
            animation: 'fxRise 1.3s ease-out both',
          }
          wait += i * 0.035
          break
        }
        default: // ring
          style = {
            width: reach * 2.2,
            height: reach * 2.2,
            borderRadius: '50%',
            border: `${Math.max(2, dist * 0.05)}px solid ${['#F2CF6E', '#FFF6DC', '#A9B3E6'][i % 3]}`,
            boxShadow: '0 0 14px rgba(255, 216, 107, 0.7), inset 0 0 14px rgba(255, 216, 107, 0.5)',
            '--dx': undefined,
            '--dy': undefined,
            '--rot': undefined,
            animation: 'fxRing .8s ease-out both',
          }
          wait += i * 0.13
      }
      parts.push(
        <span key={n} className="glyph fx-part" style={{ ...style, animationDelay: `${wait}s` }}>
          {text}
        </span>,
      )
    }
  })

  // คลื่นกระแทกขั้น 2 ขึ้นไป มีประกายเม็ดกลมพุ่งออกมาด้วย ไม่งั้นจะมีแค่วงแหวนไม่กี่วงและดูเล็กกว่าแบบอื่น
  if (type === 'ring') {
    WAVES[Math.max(1, level - 1) as FxLevel].forEach((wave, w) => {
      for (let i = 0; i < wave.count; i++) {
        const n = 1000 + w * 100 + i
        const r1 = seeded(seed + n)
        const angle = (i / wave.count) * Math.PI * 2 + r1 * 0.5
        const d = dist * wave.reach * (0.9 + r1 * 0.5)
        const size = dist * (0.09 + r1 * 0.08)
        const style: Vars = {
          width: size,
          height: size,
          borderRadius: '50%',
          background: COLORS[i % 4],
          boxShadow: '0 0 8px rgba(255, 216, 107, 0.85)',
          '--dx': `${Math.cos(angle) * d}px`,
          '--dy': `${Math.sin(angle) * d}px`,
          '--rot': '0deg',
          animation: 'fxBurst .9s cubic-bezier(.2,.8,.3,1) both',
          animationDelay: `${wave.at + delay + 0.08}s`,
        }
        parts.push(<span key={n} className="glyph fx-part" style={style} />)
      }
    })
  }

  return (
    <div className="fx-preview" aria-hidden="true">
      {parts}
      {banner && (
        <span
          className="fx-banner"
          style={{
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-head)',
            fontWeight: 700,
            fontSize: bannerSize,
            color: '#FFF6DC',
            WebkitTextStroke: `${level === 3 ? 3 : 2}px ${NIGHT}`,
            paintOrder: 'stroke',
            textShadow: level === 3 ? `0 6px 0 ${NIGHT}, 0 0 30px #F2CF6E` : `0 4px 0 ${NIGHT}, 0 0 18px #F2CF6E`,
            animation: `fxBanner ${bannerSeconds}s cubic-bezier(.34,1.56,.64,1) both`,
            zIndex: 2,
          }}
        >
          {banner}
        </span>
      )}
    </div>
  )
}

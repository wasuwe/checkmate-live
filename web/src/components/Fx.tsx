import type { CSSProperties, JSX } from 'react'
import { seeded, type FxType } from '../lib/fx'

const COLORS = ['#FFD36E', '#FF8FB1', '#9FE3C9', '#C9BDFF', '#A9D6F7', '#FFFFFF']
const INK = '#3B2F4A'

type Vars = CSSProperties & Record<'--dx' | '--dy' | '--rot', string | undefined>

interface Props {
  type: FxType
  /** ค่าที่ต่างกันให้รูปแบบการกระจายต่างกัน */
  seed: number
  /** ระยะที่ชิ้นส่วนกระจายออกไป (พิกเซล) */
  dist: number
  /** ป้ายข้อความกลางเอฟเฟกต์ เช่น "รุก!" */
  banner?: string
  bannerSize?: number
}

/** ชิ้นส่วนของเอฟเฟกต์หนึ่งครั้ง กระจายออกจากกึ่งกลางของกล่องที่ครอบอยู่ เป็นของประดับล้วน ๆ */
export function FxBurst({ type, seed, dist, banner, bannerSize = 54 }: Props): JSX.Element {
  const parts: JSX.Element[] = []
  const count = type === 'ring' ? 3 : type === 'none' ? 0 : 14

  for (let i = 0; i < count; i++) {
    const r1 = seeded(seed + i)
    const r2 = seeded(seed + i + 50)
    const angle = (i / count) * Math.PI * 2 + r1 * 0.6
    const d = dist * (0.65 + r2 * 0.45)
    let style: Vars
    let text: string | null = null

    switch (type) {
      case 'stars':
        text = '★'
        style = {
          fontSize: dist * 0.34,
          color: COLORS[i % 3],
          WebkitTextStroke: `1.5px ${INK}`,
          '--dx': `${Math.cos(angle) * d}px`,
          '--dy': `${Math.sin(angle) * d}px`,
          '--rot': `${r1 * 360}deg`,
          animation: 'fxBurst .85s cubic-bezier(.2,.8,.3,1) both',
        }
        break
      case 'hearts':
        text = '♥'
        style = {
          fontSize: dist * (0.28 + r2 * 0.18),
          color: i % 2 ? '#FF8FB1' : '#FF5C8D',
          WebkitTextStroke: `1.5px ${INK}`,
          '--dx': `${(r1 - 0.5) * dist * 1.4}px`,
          '--dy': `${-dist * (0.7 + r2 * 0.7)}px`,
          '--rot': undefined,
          animation: `fxRise 1.15s ease-out ${i * 0.035}s both`,
        }
        break
      case 'confetti':
        style = {
          width: dist * 0.12,
          height: dist * 0.22,
          borderRadius: 3,
          background: COLORS[i % 5],
          border: `1.5px solid ${INK}`,
          '--dx': `${Math.cos(angle) * d}px`,
          '--dy': `${Math.sin(angle) * d + dist * 0.35}px`,
          '--rot': `${r1 * 720 - 360}deg`,
          animation: 'fxBurst 1.05s cubic-bezier(.2,.8,.3,1) both',
        }
        break
      case 'bubbles': {
        const size = dist * (0.14 + r2 * 0.2)
        style = {
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'rgba(255,255,255,.7)',
          border: `2px solid ${INK}`,
          boxShadow: 'inset -2px -2px 0 #A9D6F7',
          '--dx': `${(r1 - 0.5) * dist * 1.6}px`,
          '--dy': `${-dist * (0.6 + r2 * 0.8)}px`,
          '--rot': undefined,
          animation: `fxRise 1.2s ease-out ${i * 0.04}s both`,
        }
        break
      }
      default: // ring
        style = {
          width: dist * 2.2,
          height: dist * 2.2,
          borderRadius: '50%',
          border: `${Math.max(3, dist * 0.07)}px solid ${['#FF5C8D', '#FFD36E', '#C9BDFF'][i]}`,
          '--dx': undefined,
          '--dy': undefined,
          '--rot': undefined,
          animation: `fxRing .75s ease-out ${i * 0.13}s both`,
        }
    }
    parts.push(
      <span key={i} className="glyph" style={style}>
        {text}
      </span>,
    )
  }

  return (
    <div className="fx-preview" aria-hidden="true">
      {parts}
      {banner && (
        <span
          style={{
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-head)',
            fontWeight: 600,
            fontSize: bannerSize,
            color: '#fff',
            WebkitTextStroke: `2px ${INK}`,
            paintOrder: 'stroke',
            textShadow: `0 5px 0 ${INK}`,
            animation: 'fxBanner 1.5s cubic-bezier(.34,1.56,.64,1) both',
            zIndex: 2,
          }}
        >
          {banner}
        </span>
      )}
    </div>
  )
}

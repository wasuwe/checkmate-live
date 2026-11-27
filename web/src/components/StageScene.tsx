import type { CSSProperties, ReactNode } from 'react'

/** ดาวสี่แฉก: ตำแหน่งเป็น % ของฉาก ขนาดเป็น px */
const STARS: { x: number; y: number; size: number; color: string }[] = [
  { x: 6, y: 8, size: 26, color: '#ffe9a8' },
  { x: 38, y: 5, size: 16, color: '#ffffff' },
  { x: 82, y: 9, size: 30, color: '#ffe9a8' },
  { x: 90, y: 46, size: 18, color: '#ffffff' },
  { x: 4, y: 58, size: 20, color: '#ffffff' },
  { x: 70, y: 30, size: 12, color: '#ffd86b' },
  { x: 20, y: 34, size: 14, color: '#ffd86b' },
]

export function StarIcon({ style, className }: { style?: CSSProperties; className?: string }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z" fill="currentColor" />
    </svg>
  )
}

interface Props {
  className?: string
  /** ตัวละครบนเวที เช่น หมากตัวใหญ่ */
  children?: ReactNode
}

/**
 * ฉากเวทีกลางคืนของสไตล์นิทาน: ฟ้าไล่สี ซุ้มโค้งเรืองแสงสองซุ้ม ดาวสี่แฉก และแสงทองที่พื้น
 * เป็นของประดับล้วน จึงซ่อนจากโปรแกรมอ่านหน้าจอ หน้าที่ใช้กำหนดขนาดและตำแหน่งเอง
 */
export function StageScene({ className, children }: Props) {
  return (
    <div className={`stage-scene${className ? ` ${className}` : ''}`} aria-hidden="true">
      <span className="stage-arch a" />
      <span className="stage-arch b" />
      {STARS.map((s, i) => (
        <StarIcon
          key={i}
          className="stage-star"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, color: s.color }}
        />
      ))}
      <span className="stage-glow" />
      {children}
    </div>
  )
}

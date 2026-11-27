import type { CSSProperties, ReactNode } from 'react'

/** ดาวสี่แฉก: ตำแหน่งเป็น % ของฉาก ขนาดเป็น px */
const STARS: { x: number; y: number; size: number; color: string }[] = [
  { x: 22, y: 12, size: 14, color: '#ffe9a8' },
  { x: 40, y: 6, size: 9, color: '#ffffff' },
  { x: 58, y: 13, size: 11, color: '#ffffff' },
  { x: 88, y: 30, size: 12, color: '#ffe9a8' },
  { x: 7, y: 40, size: 10, color: '#ffffff' },
  { x: 66, y: 4, size: 7, color: '#ffd86b' },
  { x: 33, y: 22, size: 7, color: '#ffd86b' },
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
 * ฉากเวทีกลางคืนของสไตล์นิทาน: ฟ้าไล่สี พระจันทร์เสี้ยว ซุ้มโค้งเส้นทองสองซุ้ม ดาวสี่แฉก และพื้นเวทีลายตารางหมากรุก
 * เป็นของประดับล้วน จึงซ่อนจากโปรแกรมอ่านหน้าจอ หน้าที่ใช้กำหนดขนาดและตำแหน่งเอง
 */
export function StageScene({ className, children }: Props) {
  return (
    <div className={`stage-scene${className ? ` ${className}` : ''}`} aria-hidden="true">
      <span className="stage-moon" />
      <span className="stage-arch a" />
      <span className="stage-arch b" />
      {STARS.map((s, i) => (
        <StarIcon
          key={i}
          className="stage-star"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, color: s.color }}
        />
      ))}
      <span className="stage-floor" />
      {children}
    </div>
  )
}

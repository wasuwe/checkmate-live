import type { ReactNode } from 'react'
import { safeLink } from '../lib/credits'

/** แถวของคนหนึ่งคน เป็นลิงก์เปิดแท็บใหม่ถ้ามีลิงก์ ไม่งั้นเป็นกล่องธรรมดา */
export function LinkCard({ link, children }: { link: string; children: ReactNode }) {
  const href = safeLink(link)
  if (!href) return <div className="link-card">{children}</div>
  return (
    <a className="link-card" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span aria-hidden="true">↗</span>
      <span className="sr-only"> (เปิดแท็บใหม่)</span>
    </a>
  )
}

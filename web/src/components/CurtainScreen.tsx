import type { ReactNode } from 'react'
import { Emblem } from './Emblem'

interface Props {
  /** เล่นภาพม่านเลื่อนปิดจากสองข้าง (ห้องเพิ่งปิด) ถ้าไม่ระบุ ม่านปิดอยู่แล้วตั้งแต่เปิดหน้า */
  closing?: boolean
  title: string
  text: string
  /** ปุ่มใต้ข้อความ */
  children: ReactNode
}

/**
 * หน้าม่านเวที: ใช้เมื่อห้องปิดหลังเกมจบ (ม่านเลื่อนปิด) และเมื่อเปิดลิงก์ของห้องที่ไม่มีแล้ว (ม่านปิดอยู่)
 * ม่านเป็นของประดับ ข้อความและปุ่มอยู่บนป้ายกระดาษกลางจอ
 */
export function CurtainScreen({ closing = false, title, text, children }: Props) {
  return (
    <main className={`curtain-screen${closing ? ' closing' : ''}`}>
      <div className="curtain-stage" aria-hidden="true">
        <span className="curtain left" />
        <span className="curtain right" />
        <span className="curtain-valance" />
      </div>
      <div className="curtain-card" role="status">
        <Emblem width={150} className="gold" />
        <h1 className="title starred">{title}</h1>
        <p className="pretty">{text}</p>
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          {children}
        </div>
      </div>
    </main>
  )
}

import type { ReactNode } from 'react'
import { useIsAdmin } from '../lib/admin'
import { loginAvailable } from '../lib/session'

interface Props {
  navigate: (to: string) => void
  /** หัวข้อที่แสดงให้คนที่ไม่ใช่ผู้ดูแลเห็น */
  title: string
  children: ReactNode
}

/**
 * แสดงเนื้อหาเฉพาะเมื่อผู้ใช้เป็นผู้ดูแล (admin) ใช้ครอบทุกหน้าของผู้ดูแล
 * เป็นแค่ความสะดวกของหน้าเว็บ: เซิร์ฟเวอร์ตรวจสิทธิ์ทุกคำขออยู่แล้ว
 */
export function AdminGate({ navigate, title, children }: Props) {
  const isAdmin = useIsAdmin()

  if (isAdmin === null) {
    return (
      <main className="screen">
        <p className="card center" role="status">
          กำลังตรวจสิทธิ์…
        </p>
      </main>
    )
  }
  if (!isAdmin) {
    return (
      <main className="screen">
        <h1 className="title">{title}</h1>
        <section className="card">
          <p className="pretty">หน้านี้สำหรับผู้ดูแลเท่านั้น ถ้าคุณเป็นผู้ดูแล ให้เข้าสู่ระบบด้วยอีเมลที่ได้รับสิทธิ์</p>
          <div className="row wrap">
            {loginAvailable && (
              <button type="button" className="btn butter" onClick={() => navigate('/login')}>
                เข้าสู่ระบบ
              </button>
            )}
            <button type="button" className="btn" onClick={() => navigate('/')}>
              กลับหน้าแรก
            </button>
          </div>
        </section>
      </main>
    )
  }
  return <>{children}</>
}

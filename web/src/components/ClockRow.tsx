import { formatClock, LOW_TIME_MS } from '../lib/clock'
import { Avatar } from './Avatar'

interface Props {
  /** ชื่อผู้เล่น */
  label: string
  /** ข้อความรองใต้ชื่อ เช่น สีที่เล่น */
  detail?: string
  /** รหัสรูปโปรไฟล์ (undefined = ไม่แสดงรูปเลย เช่น ตอนยังไม่มีผู้เล่น) */
  avatar?: string
  ms: number
  /** นาฬิกาของฝั่งนี้กำลังเดิน */
  running: boolean
}

/** แถบชื่อฝั่งและเวลาที่เหลือ วางเหนือและใต้กระดาน */
export function ClockRow({ label, detail, avatar, ms, running }: Props) {
  const low = ms < LOW_TIME_MS
  return (
    <div className={`clock-row${running ? ' running' : ''}`}>
      <span className="clock-player">
        {avatar !== undefined && <Avatar avatar={avatar} name={label} />}
        <span className="clock-names">
          <span className="clock-label">{label}</span>
          {detail && <span className="clock-detail">{detail}</span>}
        </span>
      </span>
      <span
        className={`clock-time${low ? ' low' : ''}`}
        role="timer"
        aria-label={`เวลาของ${label}`}
      >
        {formatClock(ms)}
      </span>
    </div>
  )
}

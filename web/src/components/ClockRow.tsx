import { formatClock, LOW_TIME_MS } from '../lib/clock'

interface Props {
  label: string
  ms: number
  /** นาฬิกาของฝั่งนี้กำลังเดิน */
  running: boolean
}

/** แถบชื่อฝั่งและเวลาที่เหลือ วางเหนือและใต้กระดาน */
export function ClockRow({ label, ms, running }: Props) {
  const low = ms < LOW_TIME_MS
  return (
    <div className={`clock-row${running ? ' running' : ''}`}>
      <span className="clock-label">{label}</span>
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

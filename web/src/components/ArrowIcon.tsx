interface Props {
  /** ทิศที่ลูกศรชี้ */
  direction: 'left' | 'up' | 'down'
  size?: number
}

const TURN = { left: 0, up: 90, down: -90 } as const

/**
 * ลูกศรแบบสติกเกอร์: เส้นหนาปลายมน สี Ink เข้ากับเส้นขอบของปุ่มทั้งระบบ
 * ใช้แทนตัวอักษรลูกศร (← ↑ ↓) ซึ่งหน้าตาขึ้นกับฟอนต์ของเครื่องและดูบางกว่าส่วนอื่นของหน้า
 * เป็นของประดับ ปุ่มที่ใช้ต้องมี aria-label บอกความหมายเอง
 */
export function ArrowIcon({ direction, size = 22 }: Props) {
  return (
    <svg
      className="arrow-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: `rotate(${TURN[direction]}deg)` }}
    >
      <path d="M11 5 4.5 12 11 19" />
      <path d="M5.5 12H19.5" />
    </svg>
  )
}

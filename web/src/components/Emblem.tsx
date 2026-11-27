/**
 * ตราลายเส้นหมึกของสไตล์นิทาน: มงกุฎกลางกับลายม้วนสองข้าง วางเหนือหัวข้อสำคัญ
 * สีตามตัวหนังสือรอบข้าง (currentColor) เป็นของประดับ จึงซ่อนจากโปรแกรมอ่านหน้าจอ
 */
export function Emblem({ width = 200, className }: { width?: number; className?: string }) {
  return (
    <svg
      className={`emblem${className ? ` ${className}` : ''}`}
      width={width}
      height={(width * 84) / 230}
      viewBox="0 12 230 84"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* มงกุฎกับเพชรค่อย ๆ ปรากฏ ส่วนลายม้วนถูกวาดออกมา (pathLength=1 ให้ CSS วาดเส้นได้) */}
      <path d="M115 18l-9 14 9-4 9 4z" fill="currentColor" className="emblem-fill" />
      <path d="M96 40l6 34h26l6-34-12 10-7-14-7 14z" className="emblem-crown emblem-fill" />
      <path d="M92 80h46" pathLength={1} className="emblem-line" />
      <path d="M88 60c-20-6-30-24-52-22-14 2-20 14-12 22 8 8 20 0 14-8" pathLength={1} className="emblem-line" />
      <path d="M142 60c20-6 30-24 52-22 14 2 20 14 12 22-8 8-20 0-14-8" pathLength={1} className="emblem-line" />
      <path d="M84 70c-24 4-40 14-62 8" pathLength={1} className="emblem-line late" />
      <path d="M146 70c24 4 40 14 62 8" pathLength={1} className="emblem-line late" />
      <path d="M58 22l4-8 4 8-4 8z" fill="currentColor" className="emblem-fill late" />
      <path d="M164 22l4-8 4 8-4 8z" fill="currentColor" className="emblem-fill late" />
    </svg>
  )
}

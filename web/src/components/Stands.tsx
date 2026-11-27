import type { SpectatorInfo } from '../lib/protocol'
import { Avatar } from './Avatar'

interface Props {
  /** ผู้ชมที่กำลังเปิดห้องอยู่ (เซิร์ฟเวอร์ส่งรายชื่อมาไม่เกินจำนวนหนึ่ง) */
  spectators: SpectatorInfo[] | undefined
  /** จำนวนผู้ชมทั้งหมด (มากกว่ารายชื่อได้) */
  watching: number | undefined
}

/** ที่นั่งที่วาดไว้เสมอแม้ยังไม่มีใครมานั่ง ให้เห็นว่าเป็นอัฒจันทร์ */
const MIN_SEATS = 3

/**
 * อัฒจันทร์ผู้ชม: บอกว่าตอนนี้มีใครดูเกมอยู่บ้าง แต่ละคนนั่งเก้าอี้พร้อมขนม (ป็อปคอร์นสลับกับน้ำอัดลม)
 * ที่นั่งว่างยังวาดไว้ให้เห็นว่ามีที่ให้ผู้ชม
 */
export function Stands({ spectators, watching }: Props) {
  const people = spectators ?? []
  const total = Math.max(watching ?? 0, people.length)
  const more = total - people.length
  const empty = Math.max(0, MIN_SEATS - people.length)
  const label = total === 0 ? 'ยังไม่มีผู้ชม' : `ผู้ชม ${total} คน`

  return (
    <section className="stands" aria-label={`ที่นั่งผู้ชม: ${label}`}>
      <div className="stands-head">
        <Popcorn />
        <b>ที่นั่งผู้ชม</b>
        <span className="stands-count">{label}</span>
        <Soda />
      </div>
      <ul className="stands-row">
        {people.map((p, i) => {
          const name = p.name || (p.guest ? 'ผู้ชมรับเชิญ' : 'ผู้ชม')
          return (
            <li key={i} className="stands-seat taken" title={name}>
              <span className="stands-chair">
                <Avatar avatar={p.avatar ?? ''} size={30} />
                <span className="stands-snack">{i % 2 === 0 ? <Popcorn /> : <Soda />}</span>
              </span>
              <span className="stands-name">{name}</span>
            </li>
          )
        })}
        {Array.from({ length: empty }, (_, i) => (
          <li key={`empty-${i}`} className="stands-seat" aria-hidden="true">
            <span className="stands-chair" />
            <span className="stands-name">ว่าง</span>
          </li>
        ))}
        {more > 0 && (
          <li className="stands-seat more">
            <span className="stands-chair">+{more}</span>
            <span className="stands-name">อีก {more} คน</span>
          </li>
        )}
      </ul>
    </section>
  )
}

/** ถังป็อปคอร์นลายแดงขาว */
function Popcorn() {
  return (
    <svg className="snack" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="#FFE9A8" stroke="#8A5A1E" strokeWidth="0.9">
        <circle cx="7.5" cy="7.5" r="3.2" />
        <circle cx="16.5" cy="7.5" r="3.2" />
        <circle cx="12" cy="5.5" r="3.6" />
        <circle cx="10" cy="9" r="2.6" />
        <circle cx="14.2" cy="9.2" r="2.6" />
      </g>
      <path d="M5 10h14l-2 12H7z" fill="#FFFDF8" stroke="#8A5A1E" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M8.2 10l1 12h1.9l-.5-12zM13.4 10l-.5 12h1.9l1-12z" fill="#C8352B" />
    </svg>
  )
}

/** แก้วน้ำอัดลมมีฝาและหลอด */
function Soda() {
  return (
    <svg className="snack" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.5 8.5 15.6 2h3.2" fill="none" stroke="#C8352B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 9.5h11l-1.4 12.3H7.9z" fill="#A9B3E6" stroke="#1E2A6B" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M7.1 14h9.8l-.4 3.4H7.5z" fill="#FFFDF8" opacity="0.85" />
      <rect x="5.3" y="7.3" width="13.4" height="2.6" rx="1.1" fill="#FFFDF8" stroke="#1E2A6B" strokeWidth="0.9" />
    </svg>
  )
}

import type { CSSProperties } from 'react'
import { boardLayout, initialOf, safeColor, safeImage, safeLink, useCredits, type BoardSeat } from '../lib/credits'

interface Props {
  navigate: (to: string) => void
}

type SeatVars = CSSProperties & Record<'--rank' | '--file' | '--side' | '--i', number>

/**
 * หน้าเครดิต: กระดานหมากรุกสามมิติมองจากด้านข้าง ทีมงานยืนกระจายอยู่ตามช่อง สองฝั่งประจันหน้ากัน
 * (เจ้าของโปรเจกต์กำหนด) แต่ละคนแสดงรูป ชื่อ และบทบาท ตัวละคร OC อยู่ในหน้าแกลเลอรี /gallery
 * ข้อมูลมาจากเซิร์ฟเวอร์ (แก้ได้ที่หน้าจัดการข้อมูลของผู้ดูแล) สี ลิงก์ และที่อยู่รูปถูกกรองอีกชั้นก่อนใส่ในหน้า
 */
export function CreditsPage({ navigate }: Props) {
  const { data, loading } = useCredits()

  if (loading) {
    return (
      <main className="screen">
        <p className="card center" role="status">
          กำลังโหลด…
        </p>
      </main>
    )
  }

  const board = boardLayout(data)

  return (
    <main className="screen wide credits" style={{ gap: 20 }}>
      <div className="row wrap" style={{ alignItems: 'center' }}>
        <h1 className="title grow">เครดิต</h1>
        {data.ocs.length > 0 && (
          <button type="button" className="btn mini page-link" onClick={() => navigate('/gallery')}>
            ดูแกลเลอรีตัวละคร
          </button>
        )}
      </div>

      {board.seats.length === 0 ? (
        <p className="card center">ยังไม่มีข้อมูลทีมงาน</p>
      ) : (
        <section className="cb" aria-label="ทีมงาน">
          <div className="cb-sides" aria-hidden="true">
            <span className="cb-side">{board.sides[0].join(', ')}</span>
            <span className="cb-vs">VS</span>
            <span className="cb-side right">{board.sides[1].join(', ')}</span>
          </div>
          <div className="cb-stage">
            <ul className="cb-plane">
              {board.seats.map((seat, i) => (
                <Standee key={seat.person.id} seat={seat} index={i} />
              ))}
            </ul>
          </div>
        </section>
      )}

      {board.overflow.length > 0 && (
        <ul className="cb-more" aria-label="ทีมงานคนอื่น ๆ">
          {board.overflow.map((seat) => (
            <Standee key={seat.person.id} seat={seat} index={0} flat />
          ))}
        </ul>
      )}
    </main>
  )
}

/** คนหนึ่งคนยืนอยู่บนช่อง: ป้ายชื่อกับบทบาทอยู่เหนือรูป เป็นลิงก์ถ้ามีลิงก์ */
function Standee({ seat, index, flat = false }: { seat: BoardSeat; index: number; flat?: boolean }) {
  const { person, roles } = seat
  const link = safeLink(person.link)
  const image = safeImage(person.image)
  const vars: SeatVars = { '--rank': seat.rank, '--file': seat.file, '--side': seat.side, '--i': index }
  const body = (
    <>
      <span className="cb-tag">
        <b className="cb-name">{person.name}</b>
        {roles.map((r) => (
          <span key={r.role} className="cb-role" style={{ background: safeColor(r.bg) }}>
            {r.role}
          </span>
        ))}
        {person.handle && <span className="cb-handle">{person.handle}</span>}
      </span>
      <span className="cb-photo" style={{ background: safeColor(person.bg) }}>
        {image ? <img src={image} alt="" draggable={false} /> : <span aria-hidden="true">{initialOf(person.name)}</span>}
      </span>
    </>
  )
  return (
    <li className={`cb-piece${flat ? ' flat' : ''} side-${seat.side}`} style={vars}>
      {link ? (
        <a className="cb-card" href={link} target="_blank" rel="noopener noreferrer">
          {body}
        </a>
      ) : (
        <div className="cb-card">{body}</div>
      )}
    </li>
  )
}

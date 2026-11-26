import { LinkCard } from '../components/LinkCard'
import { initialOf, personOf, safeColor, useCredits } from '../lib/credits'

interface Props {
  navigate: (to: string) => void
}

/**
 * หน้าเครดิต: ทีมงาน แยกตามบทบาท (ตัวละคร OC อยู่ในหน้าแกลเลอรี /gallery)
 * ข้อมูลมาจากเซิร์ฟเวอร์ (แก้ได้ที่หน้าจัดการข้อมูลของผู้ดูแล) สีและลิงก์ถูกกรองอีกชั้นก่อนใส่ในหน้า
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
      {data.team.length === 0 && <p className="card center">ยังไม่มีข้อมูลทีมงาน</p>}

      <div className="team-grid">
        {data.team.map((group) => (
          <section key={group.id} className="card side" aria-label={group.role}>
            <div>
              <span className="role-pill" style={{ background: safeColor(group.bg) }}>
                {group.role}
              </span>
            </div>
            {group.ids.map((id) => {
              const p = personOf(data, id)
              return (
                <LinkCard key={id} link={p.link}>
                  <span className="person-dot" style={{ background: safeColor(p.bg) }} aria-hidden="true">
                    {initialOf(p.name)}
                  </span>
                  <span className="grow person-text">
                    <b>{p.name}</b>
                    <span className="small">{p.handle}</span>
                  </span>
                </LinkCard>
              )
            })}
          </section>
        ))}
      </div>

    </main>
  )
}

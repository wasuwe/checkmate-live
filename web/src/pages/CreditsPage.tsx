import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { initialOf, moveIndex, ocNumber, ocsOf, OCS, ownerFilters, PEOPLE, safeLink, selectionFor, TEAM } from '../lib/credits'

/**
 * หน้าเครดิต: ทีมงาน และตัวละคร OC ที่เลือกดูได้แบบหน้าเลือกตัวของเกมต่อสู้
 * แถบเฉียงเป็นภาษาภาพของหน้านี้หน้าเดียว ไม่ใช้ในหน้าอื่น
 */
export function CreditsPage() {
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(OCS[0].id)
  const grid = useRef<HTMLDivElement>(null)

  const list = ocsOf(filter)
  const oc = OCS.find((o) => o.id === selectedId) ?? OCS[0]

  function pickFilter(id: string) {
    setFilter(id)
    setSelectedId(selectionFor(id, selectedId))
  }

  // ลูกศรเลื่อนเลือกตัวในตาราง จำนวนคอลัมน์อ่านจากตำแหน่งจริงบนจอ เพราะเปลี่ยนตามความกว้าง
  function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
    const buttons = [...(grid.current?.querySelectorAll('button') ?? [])]
    const index = list.findIndex((o) => o.id === selectedId)
    if (index < 0 || buttons.length === 0) return
    const columns = Math.max(1, buttons.filter((b) => b.offsetTop === buttons[0].offsetTop).length)
    const next = moveIndex(e.key, index, list.length, columns)
    if (next === index) return
    e.preventDefault()
    setSelectedId(list[next].id)
    buttons[next]?.focus()
  }

  return (
    <main className="screen wide credits" style={{ gap: 20 }}>
      <h1 className="title">เครดิต</h1>

      <div className="team-grid">
        {TEAM.map((group) => (
          <section key={group.role} className="card side" aria-label={group.role}>
            <div>
              <span className="role-pill" style={{ background: group.bg }}>
                {group.role}
              </span>
            </div>
            {group.ids.map((id) => {
              const p = PEOPLE[id]
              return (
                <LinkCard key={id} link={p.link}>
                  <span className="person-dot" style={{ background: p.bg }} aria-hidden="true">
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

      <div className="row wrap" style={{ alignItems: 'baseline' }}>
        <h2 className="subtitle grow">ตัวละคร OC</h2>
        <span className="small">กดเลือกตัวละครเพื่อดูรายละเอียด หรือใช้ปุ่มลูกศร</span>
      </div>

      <div className="row wrap" role="group" aria-label="กรองตามเจ้าของ">
        {ownerFilters().map((f) => (
          <button key={f.id} type="button" className="chip dark" aria-pressed={f.id === filter} onClick={() => pickFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="oc-layout">
        {/* ตารางเลือกตัว */}
        <div className="oc-grid" ref={grid} role="group" aria-label="เลือกตัวละคร" onKeyDown={onGridKey}>
          {list.map((o) => {
            const on = o.id === oc.id
            return (
              <button
                key={o.id}
                type="button"
                className={`oc-card${on ? ' on' : ''}`}
                style={{ background: o.pale }}
                aria-pressed={on}
                aria-label={`${o.name} ของ ${PEOPLE[o.owner].name}`}
                onClick={() => setSelectedId(o.id)}
              >
                <span className="oc-card-slash" style={{ background: o.color }} />
                {o.image ? (
                  <img className="oc-card-face" src={o.image} alt="" loading="lazy" />
                ) : (
                  <span className="oc-card-initial">{initialOf(o.name)}</span>
                )}
                <span className="oc-card-no">{ocNumber(o)}</span>
                <span className="oc-card-name">
                  <span>{o.name}</span>
                  <span style={{ color: o.color }}>{PEOPLE[o.owner].name}</span>
                </span>
                {on && <span className="oc-card-p1">P1</span>}
              </button>
            )
          })}
        </div>

        {/* เวทีตัวละคร: key ทำให้การเคลื่อนไหวเล่นใหม่ทุกครั้งที่เปลี่ยนตัว */}
        <div className="oc-detail" aria-live="polite">
          <div className="oc-stage" key={oc.id} style={{ '--oc': oc.color, background: oc.pale } as CSSProperties}>
            <div className="oc-slash a" />
            <div className="oc-slash b" />
            <div className="oc-slash c" />
            <div className="oc-stage-no" aria-hidden="true">
              {ocNumber(oc)}
            </div>
            <div className="oc-art">
              {oc.image ? (
                <img src={oc.image} alt={`ภาพตัวละคร ${oc.name}`} />
              ) : (
                <span className="oc-art-initial" aria-hidden="true">
                  {initialOf(oc.name)}
                </span>
              )}
            </div>
            <div className="oc-plate">
              <div>
                <span className="oc-plate-title">{oc.title}</span>
                <span className="oc-plate-name">{oc.name}</span>
              </div>
            </div>
          </div>

          <section className="card side" aria-label={`ข้อมูลของ ${oc.name}`}>
            <p className="pretty" style={{ fontSize: 15, lineHeight: 1.6 }}>
              {oc.bio}
            </p>
            <div className="oc-links">
              <LinkCard link={PEOPLE[oc.owner].link}>
                <span className="grow person-text">
                  <span className="tiny">เจ้าของ (Owner)</span>
                  <b>{PEOPLE[oc.owner].name}</b>
                </span>
              </LinkCard>
              <LinkCard link={PEOPLE[oc.artist].link}>
                <span className="grow person-text">
                  <span className="tiny">ผู้วาด (Artist)</span>
                  <b>{PEOPLE[oc.artist].name}</b>
                </span>
              </LinkCard>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

/** แถวของคนหนึ่งคน เป็นลิงก์เปิดแท็บใหม่ถ้ามีลิงก์ ไม่งั้นเป็นกล่องธรรมดา */
function LinkCard({ link, children }: { link: string; children: ReactNode }) {
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

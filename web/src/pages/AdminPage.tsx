import { useEffect, useRef, useState } from 'react'
import {
  addGroup,
  addOc,
  addPerson,
  AdminError,
  firstProblem,
  moved,
  ocsUsing,
  removePerson,
  replaced,
  saveCredits,
  toggleMember,
  uploadOcImage,
  useIsAdmin,
} from '../lib/admin'
import { fetchCredits, initialOf, safeColor, safeImage, SAMPLE_CREDITS, type CreditsData, type Oc } from '../lib/credits'
import { loginAvailable } from '../lib/session'

interface Props {
  navigate: (to: string) => void
}

/**
 * หน้าจัดการข้อมูลของผู้ดูแล: แก้ข้อมูลหน้าเครดิต (คน กลุ่มทีม ตัวละคร และรูป)
 * เซิร์ฟเวอร์ตรวจสิทธิ์และตรวจข้อมูลทุกครั้งที่บันทึก หน้านี้แค่ซ่อนตัวเองจากคนที่ไม่ใช่ admin
 */
export function AdminPage({ navigate }: Props) {
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
        <h1 className="title">จัดการข้อมูล</h1>
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
  return <CreditsEditor navigate={navigate} />
}

type Loaded = { data: CreditsData; fromSample: boolean }

function CreditsEditor({ navigate }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [data, setData] = useState<CreditsData>(SAMPLE_CREDITS)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    fetchCredits()
      .then((saved) => {
        if (!alive) return
        setLoaded({ data: saved ?? SAMPLE_CREDITS, fromSample: saved === null })
        setData(saved ?? SAMPLE_CREDITS)
      })
      .catch(() => alive && setLoadError(true))
    return () => {
      alive = false
    }
  }, [])

  // เตือนก่อนปิดหรือโหลดหน้าใหม่ถ้ายังไม่ได้บันทึก
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function change(next: CreditsData) {
    if (next === data) return
    setData(next)
    setDirty(true)
    setMessage(null)
  }

  async function save() {
    const problem = firstProblem(data)
    if (problem) {
      setMessage({ kind: 'error', text: problem })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const saved = await saveCredits(data)
      setData(saved)
      setLoaded({ data: saved, fromSample: false })
      setDirty(false)
      setMessage({ kind: 'ok', text: 'บันทึกแล้ว หน้าเครดิตแสดงข้อมูลใหม่ทันที' })
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof AdminError ? err.message : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง' })
    } finally {
      setSaving(false)
    }
  }

  if (loadError) {
    return (
      <main className="screen">
        <p className="card error" role="alert">
          โหลดข้อมูลไม่สำเร็จ ตรวจการเชื่อมต่อแล้วโหลดหน้านี้ใหม่
        </p>
      </main>
    )
  }
  if (!loaded) {
    return (
      <main className="screen">
        <p className="card center" role="status">
          กำลังโหลดข้อมูล…
        </p>
      </main>
    )
  }

  return (
    <main className="screen wide admin" style={{ gap: 20 }}>
      <h1 className="title">จัดการข้อมูล · หน้าเครดิต</h1>

      {loaded.fromSample && (
        <p className="banner" role="status">
          ยังไม่เคยบันทึกข้อมูลจริง ด้านล่างคือข้อมูลตัวอย่าง แก้ให้เป็นข้อมูลจริงแล้วกดบันทึก
        </p>
      )}

      <PeopleSection data={data} change={change} />
      <TeamSection data={data} change={change} />
      <OcSection data={data} change={change} />

      <div className="admin-bar">
        <div className="grow admin-bar-status" role="status" aria-live="polite">
          {message ? (
            <span className={message.kind === 'error' ? 'error' : undefined}>{message.text}</span>
          ) : dirty ? (
            'มีการแก้ไขที่ยังไม่ได้บันทึก'
          ) : (
            'ไม่มีการแก้ไขค้างอยู่'
          )}
        </div>
        <button type="button" className="btn" onClick={() => navigate('/credits')}>
          ดูหน้าเครดิต
        </button>
        <button type="button" className="btn pink strong" disabled={!dirty || saving} onClick={save}>
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>
    </main>
  )
}

interface SectionProps {
  data: CreditsData
  change: (next: CreditsData) => void
}

/** ปุ่มเล็กสำหรับย้ายขึ้น ย้ายลง และลบ ของรายการหนึ่งรายการ */
function RowTools({
  label,
  index,
  count,
  onMove,
  onRemove,
  removeBlocked,
}: {
  label: string
  index: number
  count: number
  onMove: (delta: number) => void
  onRemove: () => void
  /** เหตุผลที่ลบไม่ได้ (ถ้ามี) */
  removeBlocked?: string
}) {
  return (
    <div className="row-tools">
      <button type="button" className="btn mini" aria-label={`ย้าย ${label} ขึ้น`} disabled={index === 0} onClick={() => onMove(-1)}>
        ↑
      </button>
      <button type="button" className="btn mini" aria-label={`ย้าย ${label} ลง`} disabled={index === count - 1} onClick={() => onMove(1)}>
        ↓
      </button>
      <button type="button" className="btn mini danger" aria-label={`ลบ ${label}`} disabled={!!removeBlocked} title={removeBlocked} onClick={onRemove}>
        ลบ
      </button>
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field color-field">
      {label}
      <input type="color" value={safeColor(value)} onChange={(e) => onChange(e.target.value.toUpperCase())} />
    </label>
  )
}

function PeopleSection({ data, change }: SectionProps) {
  return (
    <section className="card side" aria-labelledby="admin-people">
      <h2 className="card-title" id="admin-people">
        คน ({data.people.length})
      </h2>
      <p className="small pretty">ทุกคนที่ถูกพูดถึงในหน้าเครดิต ทั้งทีมงาน เจ้าของตัวละคร และผู้วาด ลิงก์เว้นว่างได้</p>
      {data.people.map((p, i) => {
        const used = ocsUsing(data, p.id)
        const label = p.name || `คนลำดับที่ ${i + 1}`
        return (
          <div key={p.id} className="admin-row">
            <span className="person-dot" style={{ background: safeColor(p.bg) }} aria-hidden="true">
              {initialOf(p.name)}
            </span>
            <div className="admin-fields">
              <label className="field">
                ชื่อ
                <input className="input" value={p.name} maxLength={40} onChange={(e) => change({ ...data, people: replaced(data.people, i, { name: e.target.value }) })} />
              </label>
              <label className="field">
                ชื่อบัญชี
                <input className="input" value={p.handle} maxLength={40} placeholder="@name" onChange={(e) => change({ ...data, people: replaced(data.people, i, { handle: e.target.value }) })} />
              </label>
              <label className="field wide">
                ลิงก์
                <input className="input" type="url" inputMode="url" value={p.link} maxLength={300} placeholder="https://" onChange={(e) => change({ ...data, people: replaced(data.people, i, { link: e.target.value }) })} />
              </label>
              <ColorField label="สี" value={p.bg} onChange={(bg) => change({ ...data, people: replaced(data.people, i, { bg }) })} />
            </div>
            <RowTools
              label={label}
              index={i}
              count={data.people.length}
              onMove={(d) => change({ ...data, people: moved(data.people, i, d) })}
              onRemove={() => change(removePerson(data, p.id))}
              removeBlocked={used.length > 0 ? `ยังเป็นเจ้าของหรือผู้วาดของ ${used.map((o) => o.name || 'ตัวละครที่ยังไม่มีชื่อ').join(', ')}` : undefined}
            />
            {used.length > 0 && <p className="tiny admin-note">ลบไม่ได้: ยังเป็นเจ้าของหรือผู้วาดของตัวละคร {used.length} ตัว</p>}
          </div>
        )
      })}
      <div>
        <button type="button" className="btn mint" onClick={() => change(addPerson(data))}>
          + เพิ่มคน
        </button>
      </div>
    </section>
  )
}

function TeamSection({ data, change }: SectionProps) {
  return (
    <section className="card side" aria-labelledby="admin-team">
      <h2 className="card-title" id="admin-team">
        กลุ่มทีม ({data.team.length})
      </h2>
      <p className="small pretty">การ์ดด้านบนของหน้าเครดิต แยกตามบทบาท คนหนึ่งอยู่ได้หลายกลุ่ม</p>
      {data.team.map((g, i) => {
        const label = g.role || `กลุ่มลำดับที่ ${i + 1}`
        return (
          <div key={i} className="admin-row">
            <div className="admin-fields">
              <label className="field">
                ชื่อบทบาท
                <input className="input" value={g.role} maxLength={30} placeholder="เช่น Developer" onChange={(e) => change({ ...data, team: replaced(data.team, i, { role: e.target.value }) })} />
              </label>
              <ColorField label="สีป้าย" value={g.bg} onChange={(bg) => change({ ...data, team: replaced(data.team, i, { bg }) })} />
              <fieldset className="field wide members">
                <legend>สมาชิก</legend>
                {data.people.length === 0 && <span className="small">ยังไม่มีคนให้เลือก</span>}
                {data.people.map((p) => (
                  <label key={p.id} className="check-chip">
                    <input type="checkbox" checked={g.ids.includes(p.id)} onChange={() => change(toggleMember(data, i, p.id))} />
                    {p.name || 'ยังไม่มีชื่อ'}
                  </label>
                ))}
              </fieldset>
            </div>
            <RowTools
              label={label}
              index={i}
              count={data.team.length}
              onMove={(d) => change({ ...data, team: moved(data.team, i, d) })}
              onRemove={() => change({ ...data, team: data.team.filter((_, j) => j !== i) })}
            />
          </div>
        )
      })}
      <div>
        <button type="button" className="btn mint" onClick={() => change(addGroup(data))}>
          + เพิ่มกลุ่ม
        </button>
      </div>
    </section>
  )
}

function OcSection({ data, change }: SectionProps) {
  const setOc = (i: number, patch: Partial<Oc>) => change({ ...data, ocs: replaced(data.ocs, i, patch) })
  return (
    <section className="card side" aria-labelledby="admin-ocs">
      <h2 className="card-title" id="admin-ocs">
        ตัวละคร OC ({data.ocs.length})
      </h2>
      <p className="small pretty">ลำดับในรายการนี้คือเลขลำดับที่แสดงในหน้าเครดิต</p>
      {data.ocs.map((o, i) => {
        const label = o.name || `ตัวละครลำดับที่ ${i + 1}`
        return (
          <div key={o.id} className="admin-row oc">
            <OcImage oc={o} label={label} onChange={(image) => setOc(i, { image })} />
            <div className="admin-fields">
              <label className="field">
                ชื่อ
                <input className="input" value={o.name} maxLength={40} onChange={(e) => setOc(i, { name: e.target.value })} />
              </label>
              <label className="field">
                ฉายา
                <input className="input" value={o.title} maxLength={60} onChange={(e) => setOc(i, { title: e.target.value })} />
              </label>
              <label className="field">
                เจ้าของ (Owner)
                <select className="input" value={o.owner} onChange={(e) => setOc(i, { owner: e.target.value })}>
                  {data.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || 'ยังไม่มีชื่อ'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                ผู้วาด (Artist)
                <select className="input" value={o.artist} onChange={(e) => setOc(i, { artist: e.target.value })}>
                  {data.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || 'ยังไม่มีชื่อ'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field wide">
                คำอธิบาย
                <textarea className="input" rows={3} value={o.bio} maxLength={400} onChange={(e) => setOc(i, { bio: e.target.value })} />
              </label>
              <ColorField label="สีประจำตัว" value={o.color} onChange={(color) => setOc(i, { color })} />
              <ColorField label="สีพื้นหลัง" value={o.pale} onChange={(pale) => setOc(i, { pale })} />
            </div>
            <RowTools
              label={label}
              index={i}
              count={data.ocs.length}
              onMove={(d) => change({ ...data, ocs: moved(data.ocs, i, d) })}
              onRemove={() => change({ ...data, ocs: data.ocs.filter((_, j) => j !== i) })}
            />
          </div>
        )
      })}
      <div className="row wrap">
        <button type="button" className="btn mint" disabled={data.people.length === 0} onClick={() => change(addOc(data))}>
          + เพิ่มตัวละคร
        </button>
        {data.people.length === 0 && <span className="small">ต้องมีคนอย่างน้อยหนึ่งคนก่อน เพื่อเป็นเจ้าของตัวละคร</span>}
      </div>
    </section>
  )
}

/** รูปของตัวละครหนึ่งตัว: ดูตัวอย่าง อัปโหลดรูปใหม่ หรือเอารูปออก */
function OcImage({ oc, label, onChange }: { oc: Oc; label: string; onChange: (image: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const image = safeImage(oc.image)

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      onChange(await uploadOcImage(file))
    } catch (err) {
      setError(err instanceof AdminError ? err.message : 'อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="oc-image">
      <div className="oc-image-preview" style={{ background: safeColor(oc.pale, '#FFF7EC') }}>
        {image ? <img src={image} alt={`รูปของ ${label}`} /> : <span aria-hidden="true">{initialOf(oc.name)}</span>}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button type="button" className="btn mini butter" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'กำลังอัปโหลด…' : image ? 'เปลี่ยนรูป' : 'ใส่รูป'}
      </button>
      {image && (
        <button type="button" className="btn mini" disabled={busy} onClick={() => onChange('')}>
          เอารูปออก
        </button>
      )}
      {error && (
        <p className="tiny error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

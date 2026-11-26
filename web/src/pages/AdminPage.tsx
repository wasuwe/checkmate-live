import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  applyOp,
  initCredits,
  isDirty,
  ocsUsing,
  orderAfterMove,
  problemIn,
  removeOcImage,
  setOcImage,
  useIsAdmin,
  type Kind,
  type Op,
  type Result,
} from '../lib/admin'
import {
  fetchCredits,
  initialOf,
  safeColor,
  safeImage,
  SAMPLE_CREDITS,
  type CreditsData,
  type Oc,
  type Person,
  type TeamGroup,
} from '../lib/credits'
import { loginAvailable } from '../lib/session'

interface Props {
  navigate: (to: string) => void
}

/**
 * หน้าจัดการข้อมูลของผู้ดูแล: แก้ข้อมูลหน้าเครดิต (คน กลุ่มทีม ตัวละคร และรูป)
 *
 * การแก้ทำทีละรายการ แต่ละรายการมีปุ่มบันทึกของตัวเอง ผู้ดูแลหลายคนแก้คนละรายการพร้อมกันได้
 * แต่ถ้ามีคนอื่นบันทึกรายการเดียวกันไปก่อน การบันทึกจะถูกปฏิเสธและต้องรับค่าล่าสุดก่อน
 * เซิร์ฟเวอร์ตรวจสิทธิ์และตรวจข้อมูลทุกครั้ง หน้านี้แค่ซ่อนตัวเองจากคนที่ไม่ใช่ admin
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

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; data: CreditsData | null }

function CreditsEditor({ navigate }: Props) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(new Set())

  const reload = useCallback(() => {
    return fetchCredits()
      .then((data) => setLoad({ state: 'ready', data }))
      .catch(() => setLoad({ state: 'failed' }))
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // เตือนก่อนปิดหรือโหลดหน้าใหม่ถ้ายังมีรายการที่พิมพ์ไว้แต่ไม่ได้บันทึก
  const unsaved = dirtyIds.size
  useEffect(() => {
    if (unsaved === 0) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  const markDirty = useCallback((key: string, dirty: boolean) => {
    setDirtyIds((prev) => {
      if (prev.has(key) === dirty) return prev
      const next = new Set(prev)
      if (dirty) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  /** รับผลจากเซิร์ฟเวอร์: ข้อมูลล่าสุด (ถ้ามี) ถูกนำมาแสดงเสมอ ไม่ว่าจะสำเร็จหรือถูกปฏิเสธ */
  const accept = useCallback((result: Result) => {
    if (result.status !== 'error' && result.data) setLoad({ state: 'ready', data: result.data })
    return result
  }, [])

  /** คำสั่งที่มีผลทันที (เพิ่ม ลบ ย้าย): แสดงผลที่แถบสถานะของหน้า */
  async function run(op: Op, done: string) {
    setBusy(true)
    setNotice(null)
    const result = accept(await applyOp(op))
    setBusy(false)
    setNotice(result.status === 'ok' ? { kind: 'ok', text: done } : { kind: 'error', text: result.message })
  }

  async function start(data: CreditsData) {
    setBusy(true)
    setNotice(null)
    const result = accept(await initCredits(data))
    setBusy(false)
    if (result.status !== 'ok') setNotice({ kind: 'error', text: result.message })
  }

  if (load.state === 'failed') {
    return (
      <main className="screen">
        <p className="card error" role="alert">
          โหลดข้อมูลไม่สำเร็จ ตรวจการเชื่อมต่อแล้วโหลดหน้านี้ใหม่
        </p>
      </main>
    )
  }
  if (load.state === 'loading') {
    return (
      <main className="screen">
        <p className="card center" role="status">
          กำลังโหลดข้อมูล…
        </p>
      </main>
    )
  }

  const data = load.data
  if (data === null) {
    return (
      <main className="screen admin">
        <h1 className="title">จัดการข้อมูล · หน้าเครดิต</h1>
        <section className="card">
          <h2 className="card-title">ยังไม่มีข้อมูลจริง</h2>
          <p className="pretty">
            ตอนนี้หน้าเครดิตแสดงข้อมูลตัวอย่างจากไฟล์ต้นแบบ เลือกว่าจะเริ่มแก้จากข้อมูลตัวอย่าง หรือเริ่มจากหน้าว่าง
            เมื่อเลือกแล้วหน้าเครดิตจะแสดงข้อมูลชุดนี้ทันที และแก้ต่อได้ทีละรายการ
          </p>
          {notice && (
            <p className="error" role="alert">
              {notice.text}
            </p>
          )}
          <div className="row wrap">
            <button type="button" className="btn butter" disabled={busy} onClick={() => start(SAMPLE_CREDITS)}>
              เริ่มจากข้อมูลตัวอย่าง
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => start({ people: [], team: [], ocs: [] })}>
              เริ่มจากหน้าว่าง
            </button>
          </div>
        </section>
      </main>
    )
  }

  const move = (kind: Kind, ids: string[], index: number, delta: number) => {
    const next = orderAfterMove(ids, index, delta)
    if (next) void run({ op: 'order', kind, ids: next }, 'ย้ายลำดับแล้ว')
  }
  const tools = (kind: Kind, ids: string[], index: number, label: string, item: { id: string; rev: number }, blocked?: string) => (
    <RowTools
      label={label}
      index={index}
      count={ids.length}
      busy={busy}
      removeBlocked={blocked}
      onMove={(delta) => move(kind, ids, index, delta)}
      onRemove={() => run({ op: 'delete', kind, id: item.id, rev: item.rev }, `ลบ ${label} แล้ว`)}
    />
  )
  const peopleIds = data.people.map((p) => p.id)
  const teamIds = data.team.map((g) => g.id)
  const ocIds = data.ocs.map((o) => o.id)

  return (
    <main className="screen wide admin" style={{ gap: 20 }}>
      <h1 className="title">จัดการข้อมูล · หน้าเครดิต</h1>
      <p className="small pretty">
        แก้ทีละรายการแล้วกดบันทึกของรายการนั้น การเพิ่ม ลบ ย้ายลำดับ และรูป มีผลทันที ถ้ามีผู้ดูแลคนอื่นบันทึกรายการเดียวกันไปก่อน
        ระบบจะไม่บันทึกทับและให้คุณรับค่าล่าสุดก่อน
      </p>

      <section className="card side" aria-labelledby="admin-people">
        <h2 className="card-title" id="admin-people">
          คน ({data.people.length})
        </h2>
        <p className="small pretty">ทุกคนที่ถูกพูดถึงในหน้าเครดิต ทั้งทีมงาน เจ้าของตัวละคร และผู้วาด ลิงก์เว้นว่างได้</p>
        {data.people.map((p, i) => {
          const used = ocsUsing(data, p.id)
          return (
            <PersonRow key={p.id} item={p} accept={accept} markDirty={markDirty}>
              {tools(
                'people',
                peopleIds,
                i,
                p.name,
                p,
                used.length > 0 ? `ยังเป็นเจ้าของหรือผู้วาดของตัวละคร ${used.length} ตัว (${used.map((o) => o.name).join(', ')})` : undefined,
              )}
            </PersonRow>
          )
        })}
        <div>
          <button type="button" className="btn mint" disabled={busy} onClick={() => run({ op: 'create', kind: 'people' }, 'เพิ่มคนแล้ว แก้ชื่อแล้วกดบันทึก')}>
            + เพิ่มคน
          </button>
        </div>
      </section>

      <section className="card side" aria-labelledby="admin-team">
        <h2 className="card-title" id="admin-team">
          กลุ่มทีม ({data.team.length})
        </h2>
        <p className="small pretty">การ์ดด้านบนของหน้าเครดิต แยกตามบทบาท คนหนึ่งอยู่ได้หลายกลุ่ม</p>
        {data.team.map((g, i) => (
          <GroupRow key={g.id} item={g} people={data.people} accept={accept} markDirty={markDirty}>
            {tools('team', teamIds, i, g.role, g)}
          </GroupRow>
        ))}
        <div>
          <button type="button" className="btn mint" disabled={busy} onClick={() => run({ op: 'create', kind: 'team' }, 'เพิ่มกลุ่มแล้ว แก้ชื่อแล้วกดบันทึก')}>
            + เพิ่มกลุ่ม
          </button>
        </div>
      </section>

      <section className="card side" aria-labelledby="admin-ocs">
        <h2 className="card-title" id="admin-ocs">
          ตัวละคร OC ({data.ocs.length})
        </h2>
        <p className="small pretty">ลำดับในรายการนี้คือเลขลำดับที่แสดงในหน้าเครดิต รูปที่ถูกเปลี่ยนหรือเอาออกจะถูกลบจากระบบทันที</p>
        {data.ocs.map((o, i) => (
          <OcRow key={o.id} item={o} people={data.people} accept={accept} markDirty={markDirty}>
            {tools('ocs', ocIds, i, o.name, o)}
          </OcRow>
        ))}
        <div className="row wrap">
          <button type="button" className="btn mint" disabled={busy || data.people.length === 0} onClick={() => run({ op: 'create', kind: 'ocs' }, 'เพิ่มตัวละครแล้ว แก้ชื่อแล้วกดบันทึก')}>
            + เพิ่มตัวละคร
          </button>
          {data.people.length === 0 && <span className="small">ต้องมีคนอย่างน้อยหนึ่งคนก่อน เพื่อเป็นเจ้าของตัวละคร</span>}
        </div>
      </section>

      <div className="admin-bar">
        <div className="grow admin-bar-status" role="status" aria-live="polite">
          {notice ? (
            <span className={notice.kind === 'error' ? 'error' : undefined}>{notice.text}</span>
          ) : unsaved > 0 ? (
            `มี ${unsaved} รายการที่ยังไม่ได้บันทึก`
          ) : (
            'ทุกรายการบันทึกแล้ว'
          )}
        </div>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={async () => {
            setNotice(null)
            setBusy(true)
            await reload()
            setBusy(false)
          }}
        >
          โหลดข้อมูลล่าสุด
        </button>
        <button type="button" className="btn" onClick={() => navigate('/credits')}>
          ดูหน้าเครดิต
        </button>
      </div>
    </main>
  )
}

// ---------- การแก้หนึ่งรายการ ----------

interface Draft<T> {
  draft: T
  set: (patch: Partial<T>) => void
  dirty: boolean
  /** มีคนอื่นแก้รายการนี้ไปแล้วระหว่างที่เรายังพิมพ์ค้างอยู่ */
  stale: boolean
  saving: boolean
  message: { kind: 'ok' | 'error'; text: string } | null
  save: () => void
  /** ทิ้งสิ่งที่พิมพ์ไว้ แล้วใช้ค่าล่าสุดจากเซิร์ฟเวอร์ */
  takeLatest: () => void
}

interface RowProps<T> {
  item: T
  accept: (result: Result) => Result
  markDirty: (key: string, dirty: boolean) => void
  children: ReactNode
}

/**
 * สถานะการแก้ของหนึ่งรายการ
 * - draft คือค่าที่กำลังพิมพ์ base คือค่าจากเซิร์ฟเวอร์ที่ draft เริ่มมา
 * - ถ้าเซิร์ฟเวอร์มีรุ่นใหม่ (item.rev ต่างจาก base.rev) และเราไม่ได้พิมพ์อะไรค้าง ก็รับค่าใหม่เงียบ ๆ
 *   ถ้าพิมพ์ค้างอยู่ จะขึ้นคำเตือนและไม่ให้บันทึก จนกว่าจะเลือกรับค่าล่าสุด
 */
function useDraft<T extends Person | TeamGroup | Oc>(kind: Kind, item: T, toOp: (draft: T, rev: number) => Op, { accept, markDirty }: Pick<RowProps<T>, 'accept' | 'markDirty'>): Draft<T> {
  const [base, setBase] = useState(item)
  const [draft, setDraft] = useState(item)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<Draft<T>['message']>(null)

  const dirty = isDirty(draft, base)
  // ปรับค่าระหว่าง render (ไม่ใช้ effect): เกิดเมื่อเซิร์ฟเวอร์มีรุ่นใหม่และเราไม่ได้พิมพ์อะไรค้าง
  if (item.rev !== base.rev && !dirty) {
    setBase(item)
    setDraft(item)
  }
  const stale = item.rev !== base.rev && dirty

  const key = `${kind}:${item.id}`
  useEffect(() => {
    markDirty(key, dirty)
    return () => markDirty(key, false)
  }, [key, dirty, markDirty])

  async function save() {
    const problem = problemIn(kind, draft)
    if (problem) {
      setMessage({ kind: 'error', text: problem })
      return
    }
    setSaving(true)
    setMessage(null)
    const result = accept(await applyOp(toOp(draft, base.rev)))
    setSaving(false)
    if (result.status === 'ok') {
      // ค่าที่เซิร์ฟเวอร์จัดรูปแล้วจะมาทาง item ในการ render ถัดไป และถูกรับเพราะ draft ไม่ต่างจาก base แล้ว
      setBase(draft)
      setMessage({ kind: 'ok', text: 'บันทึกแล้ว' })
    } else {
      setMessage({ kind: 'error', text: result.message })
    }
  }

  return {
    draft,
    set: (patch) => {
      setDraft((d) => ({ ...d, ...patch }))
      setMessage(null)
    },
    dirty,
    stale,
    saving,
    message,
    save,
    takeLatest: () => {
      setBase(item)
      setDraft(item)
      setMessage(null)
    },
  }
}

/** แถบล่างของรายการ: ปุ่มบันทึก ข้อความ และคำเตือนเมื่อมีคนอื่นแก้ไปก่อน */
function SaveLine<T>({ label, d }: { label: string; d: Draft<T> }) {
  return (
    <div className="save-line">
      {d.stale ? (
        <>
          <p className="error" role="alert">
            มีผู้ดูแลคนอื่นแก้รายการนี้ไปแล้ว สิ่งที่คุณพิมพ์ยังไม่ถูกบันทึกและบันทึกทับไม่ได้
          </p>
          <button type="button" className="btn mini butter" onClick={d.takeLatest}>
            ใช้ค่าล่าสุด (ทิ้งที่พิมพ์ไว้)
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn mini butter" aria-label={`บันทึก ${label}`} disabled={!d.dirty || d.saving} onClick={d.save}>
            {d.saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
          {d.dirty && !d.message && <span className="tiny">ยังไม่ได้บันทึก</span>}
          {d.message && (
            <span className={d.message.kind === 'error' ? 'tiny error' : 'tiny'} role={d.message.kind === 'error' ? 'alert' : 'status'}>
              {d.message.text}
            </span>
          )}
        </>
      )}
    </div>
  )
}

/** ปุ่มย้ายขึ้น ย้ายลง และลบ (กดสองครั้งเพื่อยืนยัน) ของรายการหนึ่งรายการ มีผลทันที */
function RowTools({
  label,
  index,
  count,
  busy,
  onMove,
  onRemove,
  removeBlocked,
}: {
  label: string
  index: number
  count: number
  busy: boolean
  onMove: (delta: number) => void
  onRemove: () => void
  /** เหตุผลที่ลบไม่ได้ (ถ้ามี) */
  removeBlocked?: string
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="row-tools">
      <button type="button" className="btn mini" aria-label={`ย้าย ${label} ขึ้น`} disabled={busy || index === 0} onClick={() => onMove(-1)}>
        ↑
      </button>
      <button type="button" className="btn mini" aria-label={`ย้าย ${label} ลง`} disabled={busy || index === count - 1} onClick={() => onMove(1)}>
        ↓
      </button>
      {confirming ? (
        <>
          <button
            type="button"
            className="btn mini danger"
            disabled={busy}
            onClick={() => {
              setConfirming(false)
              onRemove()
            }}
          >
            ยืนยันลบ
          </button>
          <button type="button" className="btn mini" onClick={() => setConfirming(false)}>
            ยกเลิก
          </button>
        </>
      ) : (
        <button type="button" className="btn mini danger" aria-label={`ลบ ${label}`} disabled={busy || !!removeBlocked} title={removeBlocked} onClick={() => setConfirming(true)}>
          ลบ
        </button>
      )}
      {removeBlocked && <p className="tiny admin-note">ลบไม่ได้: {removeBlocked}</p>}
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

function PersonRow({ item, children, ...shared }: RowProps<Person>) {
  const d = useDraft('people', item, (person, rev) => ({ op: 'save', kind: 'people', id: item.id, rev, person }), shared)
  const p = d.draft
  return (
    <div className={`admin-row${d.dirty ? ' dirty' : ''}`}>
      <span className="person-dot" style={{ background: safeColor(p.bg) }} aria-hidden="true">
        {initialOf(p.name)}
      </span>
      <div className="admin-fields">
        <label className="field">
          ชื่อ
          <input className="input" value={p.name} maxLength={40} onChange={(e) => d.set({ name: e.target.value })} />
        </label>
        <label className="field">
          ชื่อบัญชี
          <input className="input" value={p.handle} maxLength={40} placeholder="@name" onChange={(e) => d.set({ handle: e.target.value })} />
        </label>
        <label className="field wide">
          ลิงก์
          <input className="input" type="url" inputMode="url" value={p.link} maxLength={300} placeholder="https://" onChange={(e) => d.set({ link: e.target.value })} />
        </label>
        <ColorField label="สี" value={p.bg} onChange={(bg) => d.set({ bg })} />
        <SaveLine label={item.name} d={d} />
      </div>
      {children}
    </div>
  )
}

function GroupRow({ item, people, children, ...shared }: RowProps<TeamGroup> & { people: Person[] }) {
  const d = useDraft('team', item, (group, rev) => ({ op: 'save', kind: 'team', id: item.id, rev, group }), shared)
  const g = d.draft
  // คนที่ถูกลบไปแล้วไม่นับเป็นสมาชิก (เซิร์ฟเวอร์เอาออกจากกลุ่มให้ตอนลบคน)
  const members = g.ids.filter((id) => people.some((p) => p.id === id))
  const toggle = (id: string) => d.set({ ids: members.includes(id) ? members.filter((m) => m !== id) : [...members, id] })
  return (
    <div className={`admin-row${d.dirty ? ' dirty' : ''}`}>
      <div className="admin-fields">
        <label className="field">
          ชื่อบทบาท
          <input className="input" value={g.role} maxLength={30} placeholder="เช่น Developer" onChange={(e) => d.set({ role: e.target.value })} />
        </label>
        <ColorField label="สีป้าย" value={g.bg} onChange={(bg) => d.set({ bg })} />
        <fieldset className="field wide members">
          <legend>สมาชิก</legend>
          {people.length === 0 && <span className="small">ยังไม่มีคนให้เลือก</span>}
          {people.map((p) => (
            <label key={p.id} className="check-chip">
              <input type="checkbox" checked={members.includes(p.id)} onChange={() => toggle(p.id)} />
              {p.name}
            </label>
          ))}
        </fieldset>
        <SaveLine label={item.role} d={d} />
      </div>
      {children}
    </div>
  )
}

function OcRow({ item, people, children, ...shared }: RowProps<Oc> & { people: Person[] }) {
  const d = useDraft('ocs', item, (oc, rev) => ({ op: 'save', kind: 'ocs', id: item.id, rev, oc }), shared)
  const o = d.draft
  return (
    <div className={`admin-row oc${d.dirty ? ' dirty' : ''}`}>
      {/* รูปเป็นของรุ่นล่าสุดบนเซิร์ฟเวอร์เสมอ จึงใช้ item ไม่ใช่ draft และปิดไว้ระหว่างที่ฟอร์มยังไม่ได้บันทึก */}
      <OcImage oc={item} pale={o.pale} locked={d.dirty} accept={shared.accept} />
      <div className="admin-fields">
        <label className="field">
          ชื่อ
          <input className="input" value={o.name} maxLength={40} onChange={(e) => d.set({ name: e.target.value })} />
        </label>
        <label className="field">
          ฉายา
          <input className="input" value={o.title} maxLength={60} onChange={(e) => d.set({ title: e.target.value })} />
        </label>
        <label className="field">
          เจ้าของ (Owner)
          <select className="input" value={o.owner} onChange={(e) => d.set({ owner: e.target.value })}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          ผู้วาด (Artist)
          <select className="input" value={o.artist} onChange={(e) => d.set({ artist: e.target.value })}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field wide">
          คำอธิบาย
          <textarea className="input" rows={3} value={o.bio} maxLength={400} onChange={(e) => d.set({ bio: e.target.value })} />
        </label>
        <ColorField label="สีประจำตัว" value={o.color} onChange={(color) => d.set({ color })} />
        <ColorField label="สีพื้นหลัง" value={o.pale} onChange={(pale) => d.set({ pale })} />
        <SaveLine label={item.name} d={d} />
      </div>
      {children}
    </div>
  )
}

/**
 * รูปของตัวละครหนึ่งตัว: ใส่รูป เปลี่ยนรูป หรือเอารูปออก มีผลทันที และรูปเดิมถูกลบจากเซิร์ฟเวอร์
 * ปิดไว้ (locked) ระหว่างที่ฟอร์มของตัวละครยังไม่ได้บันทึก เพราะการเปลี่ยนรูปทำให้รายการได้รุ่นใหม่
 */
function OcImage({ oc, pale, locked, accept }: { oc: Oc; pale: string; locked: boolean; accept: (result: Result) => Result }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const image = safeImage(oc.image)

  async function apply(action: Promise<Result>) {
    setBusy(true)
    setError('')
    const result = accept(await action)
    setBusy(false)
    if (result.status !== 'ok') setError(result.message)
    if (input.current) input.current.value = ''
  }

  return (
    <div className="oc-image">
      <div className="oc-image-preview" style={{ background: safeColor(pale, '#FFF7EC') }}>
        {image ? <img src={image} alt={`รูปของ ${oc.name}`} /> : <span aria-hidden="true">{initialOf(oc.name)}</span>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void apply(setOcImage(oc, file))
        }}
      />
      <button type="button" className="btn mini butter" disabled={busy || locked} onClick={() => input.current?.click()}>
        {busy ? 'กำลังทำ…' : image ? 'เปลี่ยนรูป' : 'ใส่รูป'}
      </button>
      {image && (
        <button type="button" className="btn mini" disabled={busy || locked} onClick={() => apply(removeOcImage(oc))}>
          เอารูปออก
        </button>
      )}
      {locked && <p className="tiny">บันทึกข้อมูลของตัวละครก่อน จึงจะเปลี่ยนรูปได้</p>}
      {error && (
        <p className="tiny error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowIcon } from '../components/ArrowIcon'
import {
  applyOp,
  initCredits,
  isDirty,
  ocsUsing,
  orderAfterMove,
  problemIn,
  removeOcImage,
  type ImageKind,
  setOcImage,
  useIsAdmin,
  type Kind,
  type Op,
  type Result,
} from '../lib/admin'
import {
  fetchCredits,
  initialOf,
  ocNumber,
  personOf,
  safeColor,
  safeImage,
  SAMPLE_CREDITS,
  type CreditsData,
  type Oc,
  type Person,
  type TeamGroup,
} from '../lib/credits'
import { PIECE_STUDIO_PATH } from '../lib/router'
import { loginAvailable } from '../lib/session'

interface Props {
  navigate: (to: string) => void
}

/**
 * หน้าจัดการข้อมูลของผู้ดูแล: แก้ข้อมูลหน้าเครดิต (คน กลุ่มทีม ตัวละคร และรูป)
 *
 * หน้าตา: แท็บแยกสามหมวด แต่ละรายการเป็นแถวสรุปที่กดเพื่อกางฟอร์มออกมาแก้
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

const TABS: { kind: Kind; label: string; add: string; hint: string }[] = [
  { kind: 'people', label: 'คน', add: '+ เพิ่มคน', hint: 'ทุกคนที่ถูกพูดถึงในหน้าเครดิตและแกลเลอรี ทั้งทีมงาน เจ้าของตัวละคร และผู้วาด' },
  { kind: 'team', label: 'กลุ่มทีม', add: '+ เพิ่มกลุ่ม', hint: 'การ์ดในหน้าเครดิต แยกตามบทบาท คนหนึ่งอยู่ได้หลายกลุ่ม' },
  { kind: 'ocs', label: 'ตัวละคร OC', add: '+ เพิ่มตัวละคร', hint: 'ตัวละครในหน้าแกลเลอรี ลำดับในรายการนี้คือเลขลำดับที่แสดง' },
]

function CreditsEditor({ navigate }: Props) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [dirtyKeys, setDirtyKeys] = useState<ReadonlySet<string>>(new Set())
  const [tab, setTab] = useState<Kind>('people')
  /** รายการที่เพิ่งเพิ่ม ให้กางฟอร์มรอไว้เลย */
  const [fresh, setFresh] = useState('')

  const reload = useCallback(() => {
    return fetchCredits()
      .then((data) => setLoad({ state: 'ready', data }))
      .catch(() => setLoad({ state: 'failed' }))
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // เตือนก่อนปิดหรือโหลดหน้าใหม่ถ้ายังมีรายการที่พิมพ์ไว้แต่ไม่ได้บันทึก
  const unsaved = dirtyKeys.size
  useEffect(() => {
    if (unsaved === 0) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  const markDirty = useCallback((key: string, dirty: boolean) => {
    setDirtyKeys((prev) => {
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
  async function run(op: Op, done: string): Promise<Result> {
    setBusy(true)
    setNotice(null)
    const result = accept(await applyOp(op))
    setBusy(false)
    setNotice(result.status === 'ok' ? { kind: 'ok', text: done } : { kind: 'error', text: result.message })
    return result
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
        <h1 className="title">จัดการข้อมูล · เครดิตและแกลเลอรี</h1>
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

  const lists: Record<Kind, { id: string; rev: number }[]> = { people: data.people, team: data.team, ocs: data.ocs }

  /** เพิ่มรายการใหม่ แล้วกางฟอร์มของรายการนั้นรอไว้ */
  async function add(kind: Kind) {
    const before = new Set(lists[kind].map((x) => x.id))
    const result = await run({ op: 'create', kind }, 'เพิ่มแล้ว แก้ข้อมูลแล้วกดบันทึก')
    if (result.status !== 'ok') return
    const created = (kind === 'people' ? result.data.people : kind === 'team' ? result.data.team : result.data.ocs).find((x) => !before.has(x.id))
    if (created) setFresh(`${kind}:${created.id}`)
  }

  /** สิ่งที่ทุกแถวใช้ร่วมกัน: ตำแหน่ง การย้าย การลบ และการแจ้งสถานะ */
  const common = (kind: Kind, index: number, label: string, removeBlocked?: string) => {
    const ids = lists[kind].map((x) => x.id)
    const item = lists[kind][index]
    return {
      accept,
      markDirty,
      index,
      count: ids.length,
      busy,
      removeBlocked,
      startOpen: fresh === `${kind}:${item.id}`,
      onMove: (delta: number) => {
        const next = orderAfterMove(ids, index, delta)
        if (next) void run({ op: 'order', kind, ids: next }, 'ย้ายลำดับแล้ว')
      },
      onRemove: () => void run({ op: 'delete', kind, id: item.id, rev: item.rev }, `ลบ ${label} แล้ว`),
    }
  }
  const pending = (kind: Kind) => [...dirtyKeys].filter((k) => k.startsWith(kind + ':')).length
  const current = TABS.find((t) => t.kind === tab) ?? TABS[0]

  return (
    <main className="screen wide admin" style={{ gap: 16 }}>
      <div className="row wrap admin-head">
        <h1 className="title grow">จัดการข้อมูล · เครดิตและแกลเลอรี</h1>
        <button type="button" className="btn mini" onClick={() => navigate('/credits')}>
          ดูหน้าเครดิต
        </button>
        <button type="button" className="btn mini" onClick={() => navigate('/gallery')}>
          ดูแกลเลอรี
        </button>
        <button type="button" className="btn mini" onClick={() => navigate(PIECE_STUDIO_PATH)}>
          จัดการรูปแบบหมาก
        </button>
      </div>

      <div className="admin-tabs" role="tablist" aria-label="หมวดข้อมูล">
        {TABS.map((t) => (
          <button
            key={t.kind}
            type="button"
            role="tab"
            id={`tab-${t.kind}`}
            aria-selected={t.kind === tab}
            aria-controls={`panel-${t.kind}`}
            className="admin-tab"
            onClick={() => setTab(t.kind)}
          >
            {t.label}
            <span className="admin-tab-count">{lists[t.kind].length}</span>
            {pending(t.kind) > 0 && <span className="admin-tab-dot" title="มีรายการที่ยังไม่ได้บันทึก" aria-label="มีรายการที่ยังไม่ได้บันทึก" />}
          </button>
        ))}
      </div>

      {/* ทุกหมวดอยู่ในหน้าตลอด (ซ่อนด้วย hidden) สิ่งที่พิมพ์ค้างไว้จึงไม่หายเมื่อสลับแท็บ */}
      {TABS.map((t) => (
        <section key={t.kind} className="admin-panel" role="tabpanel" id={`panel-${t.kind}`} aria-labelledby={`tab-${t.kind}`} hidden={t.kind !== tab}>
          <div className="row wrap admin-panel-head">
            <p className="small pretty grow">{t.hint}</p>
            <button type="button" className="btn mint" disabled={busy || (t.kind === 'ocs' && data.people.length === 0)} onClick={() => add(t.kind)}>
              {t.add}
            </button>
          </div>
          {t.kind === 'ocs' && data.people.length === 0 && <p className="small">ต้องเพิ่มคนอย่างน้อยหนึ่งคนก่อน เพื่อเป็นเจ้าของตัวละคร</p>}
          {lists[t.kind].length === 0 && <p className="card plain center small">ยังไม่มีรายการ กด “{t.add}” เพื่อเริ่ม</p>}

          {t.kind === 'people' &&
            data.people.map((p, i) => {
              const used = ocsUsing(data, p.id)
              const blocked = used.length > 0 ? `ยังเป็นเจ้าของหรือผู้วาดของ ${used.map((o) => o.name).join(', ')}` : undefined
              return <PersonRow key={p.id} item={p} {...common('people', i, p.name, blocked)} />
            })}
          {t.kind === 'team' && data.team.map((g, i) => <GroupRow key={g.id} item={g} people={data.people} {...common('team', i, g.role)} />)}
          {t.kind === 'ocs' && data.ocs.map((o, i) => <OcRow key={o.id} item={o} data={data} {...common('ocs', i, o.name)} />)}
        </section>
      ))}

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
        <span className="tiny admin-bar-tab">หมวด: {current.label}</span>
        <button
          type="button"
          className="btn mini"
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
  index: number
  count: number
  busy: boolean
  onMove: (delta: number) => void
  onRemove: () => void
  /** เหตุผลที่ลบไม่ได้ (ถ้ามี) */
  removeBlocked?: string
  /** กางฟอร์มไว้ตั้งแต่แรก (รายการที่เพิ่งเพิ่ม) */
  startOpen: boolean
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

/**
 * การ์ดของหนึ่งรายการ: แถวสรุปที่เห็นตลอด (รูปย่อ ชื่อ ปุ่มย้าย ปุ่มแก้ไข) และฟอร์มที่กางออกเมื่อกดแก้ไข
 * รายการที่พิมพ์ค้างไว้จะกางอยู่เสมอ เพื่อไม่ให้ลืมบันทึก
 */
function ItemCard<T>({
  d,
  label,
  thumb,
  title,
  subtitle,
  row,
  children,
}: {
  d: Draft<T>
  /** ชื่อที่บันทึกไว้ ใช้ในป้ายของปุ่ม */
  label: string
  thumb: ReactNode
  title: ReactNode
  subtitle: ReactNode
  row: Omit<RowProps<T>, 'item' | 'accept' | 'markDirty'>
  children: ReactNode
}) {
  const [wantOpen, setWantOpen] = useState(row.startOpen)
  const [confirming, setConfirming] = useState(false)
  const pinned = d.dirty || d.stale
  const open = wantOpen || pinned
  const card = useRef<HTMLDivElement>(null)

  // รายการที่เพิ่งเพิ่ม: เลื่อนมาให้เห็น
  useEffect(() => {
    if (!row.startOpen) return
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    card.current?.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' })
  }, [row.startOpen])

  return (
    <div ref={card} className={`admin-row${open ? ' open' : ''}${d.dirty ? ' dirty' : ''}`}>
      <div className="admin-row-head">
        {thumb}
        <button type="button" className="admin-row-title" aria-expanded={open} disabled={pinned} onClick={() => setWantOpen(!open)}>
          <b>{title}</b>
          <span className="small">{subtitle}</span>
        </button>
        {d.dirty && <span className="pill unsaved">ยังไม่ได้บันทึก</span>}
        <div className="admin-row-move">
          <button type="button" className="btn mini" aria-label={`ย้าย ${label} ขึ้น`} disabled={row.busy || row.index === 0} onClick={() => row.onMove(-1)}>
            <ArrowIcon direction="up" size={18} />
          </button>
          <button type="button" className="btn mini" aria-label={`ย้าย ${label} ลง`} disabled={row.busy || row.index === row.count - 1} onClick={() => row.onMove(1)}>
            <ArrowIcon direction="down" size={18} />
          </button>
          <button type="button" className="btn mini butter admin-row-toggle" aria-label={open ? `ปิด ${label}` : `แก้ไข ${label}`} disabled={pinned} onClick={() => setWantOpen(!open)}>
            {open ? 'ปิด' : 'แก้ไข'}
          </button>
        </div>
      </div>

      {open && (
        <div className="admin-row-body">
          {children}

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
                {d.dirty && (
                  <button type="button" className="btn mini" disabled={d.saving} onClick={d.takeLatest}>
                    ยกเลิกที่พิมพ์
                  </button>
                )}
                {d.message && (
                  <span className={d.message.kind === 'error' ? 'small error' : 'small'} role={d.message.kind === 'error' ? 'alert' : 'status'}>
                    {d.message.text}
                  </span>
                )}
              </>
            )}
            <span className="grow" />
            {confirming ? (
              <>
                <button
                  type="button"
                  className="btn mini danger"
                  disabled={row.busy}
                  onClick={() => {
                    setConfirming(false)
                    row.onRemove()
                  }}
                >
                  ยืนยันลบ
                </button>
                <button type="button" className="btn mini" onClick={() => setConfirming(false)}>
                  ไม่ลบ
                </button>
              </>
            ) : (
              <button type="button" className="btn mini danger" aria-label={`ลบ ${label}`} disabled={row.busy || !!row.removeBlocked} onClick={() => setConfirming(true)}>
                ลบรายการนี้
              </button>
            )}
          </div>
          {row.removeBlocked && <p className="tiny admin-note">ลบไม่ได้: {row.removeBlocked}</p>}
        </div>
      )}
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

function PersonRow({ item, accept, markDirty, ...row }: RowProps<Person>) {
  const d = useDraft('people', item, (person, rev) => ({ op: 'save', kind: 'people', id: item.id, rev, person }), { accept, markDirty })
  const p = d.draft
  return (
    <ItemCard
      d={d}
      label={item.name}
      row={row}
      thumb={
        <span className="person-dot" style={{ background: safeColor(p.bg) }} aria-hidden="true">
          {safeImage(item.image) ? <img src={safeImage(item.image)!} alt="" /> : initialOf(p.name)}
        </span>
      }
      title={p.name || 'ยังไม่มีชื่อ'}
      subtitle={[p.handle, p.link ? 'มีลิงก์' : 'ไม่มีลิงก์', safeImage(item.image) ? 'มีรูป' : 'ยังไม่มีรูป'].filter(Boolean).join(' · ')}
    >
      <div className="oc-edit">
        {/* รูปเป็นของรุ่นล่าสุดบนเซิร์ฟเวอร์เสมอ จึงใช้ item ไม่ใช่ draft */}
        <OcImage kind="people" oc={item} pale={p.bg} locked={d.dirty} accept={accept} />
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
          ลิงก์ (เว้นว่างได้)
          <input className="input" type="url" inputMode="url" value={p.link} maxLength={300} placeholder="https://" onChange={(e) => d.set({ link: e.target.value })} />
        </label>
        <ColorField label="สีวงกลม" value={p.bg} onChange={(bg) => d.set({ bg })} />
      </div>
      </div>
    </ItemCard>
  )
}

function GroupRow({ item, people, accept, markDirty, ...row }: RowProps<TeamGroup> & { people: Person[] }) {
  const d = useDraft('team', item, (group, rev) => ({ op: 'save', kind: 'team', id: item.id, rev, group }), { accept, markDirty })
  const g = d.draft
  // คนที่ถูกลบไปแล้วไม่นับเป็นสมาชิก (เซิร์ฟเวอร์เอาออกจากกลุ่มให้ตอนลบคน)
  const members = g.ids.filter((id) => people.some((p) => p.id === id))
  const toggle = (id: string) => d.set({ ids: members.includes(id) ? members.filter((m) => m !== id) : [...members, id] })
  const names = members.map((id) => people.find((p) => p.id === id)?.name).join(', ')
  return (
    <ItemCard
      d={d}
      label={item.role}
      row={row}
      thumb={<span className="role-swatch" style={{ background: safeColor(g.bg) }} aria-hidden="true" />}
      title={g.role || 'ยังไม่มีชื่อบทบาท'}
      subtitle={members.length > 0 ? `${members.length} คน: ${names}` : 'ยังไม่มีสมาชิก'}
    >
      <div className="admin-fields">
        <label className="field">
          ชื่อบทบาท
          <input className="input" value={g.role} maxLength={30} placeholder="เช่น Developer" onChange={(e) => d.set({ role: e.target.value })} />
        </label>
        <ColorField label="สีป้าย" value={g.bg} onChange={(bg) => d.set({ bg })} />
        <fieldset className="field wide members">
          <legend>สมาชิก (ติ๊กเพื่อเลือก)</legend>
          {people.length === 0 && <span className="small">ยังไม่มีคนให้เลือก เพิ่มคนในแท็บ “คน” ก่อน</span>}
          {people.map((p) => (
            <label key={p.id} className="check-chip">
              <input type="checkbox" checked={members.includes(p.id)} onChange={() => toggle(p.id)} />
              {p.name}
            </label>
          ))}
        </fieldset>
      </div>
    </ItemCard>
  )
}

function OcRow({ item, data, accept, markDirty, ...row }: RowProps<Oc> & { data: CreditsData }) {
  const d = useDraft('ocs', item, (oc, rev) => ({ op: 'save', kind: 'ocs', id: item.id, rev, oc }), { accept, markDirty })
  const o = d.draft
  const image = safeImage(item.image)
  return (
    <ItemCard
      d={d}
      label={item.name}
      row={row}
      thumb={
        <span className="oc-thumb" style={{ background: safeColor(o.pale, '#FFF7EC'), borderColor: safeColor(o.color, '#3B2F4A') }} aria-hidden="true">
          {image ? <img src={image} alt="" /> : initialOf(o.name)}
        </span>
      }
      title={
        <>
          <span className="oc-no">{ocNumber(data, item)}</span> {o.name || 'ยังไม่มีชื่อ'}
        </>
      }
      subtitle={[o.title, `เจ้าของ ${personOf(data, o.owner).name}`, image ? 'มีรูป' : 'ยังไม่มีรูป'].filter(Boolean).join(' · ')}
    >
      <div className="oc-edit">
        {/* รูปเป็นของรุ่นล่าสุดบนเซิร์ฟเวอร์เสมอ จึงใช้ item ไม่ใช่ draft และปิดไว้ระหว่างที่ฟอร์มยังไม่ได้บันทึก */}
        <OcImage oc={item} pale={o.pale} locked={d.dirty} accept={accept} />
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
              {data.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            ผู้วาด (Artist)
            <select className="input" value={o.artist} onChange={(e) => d.set({ artist: e.target.value })}>
              {data.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field wide">
            คำอธิบาย
            <textarea className="input" rows={3} value={o.bio} maxLength={400} onChange={(e) => d.set({ bio: e.target.value })} />
            <span className="tiny count">{[...o.bio].length}/400</span>
          </label>
          <ColorField label="สีประจำตัว" value={o.color} onChange={(color) => d.set({ color })} />
          <ColorField label="สีพื้นหลัง" value={o.pale} onChange={(pale) => d.set({ pale })} />
        </div>
      </div>
    </ItemCard>
  )
}

/**
 * รูปของตัวละครหนึ่งตัว: ใส่รูป เปลี่ยนรูป หรือเอารูปออก มีผลทันที และรูปเดิมถูกลบจากเซิร์ฟเวอร์
 * ปิดไว้ (locked) ระหว่างที่ฟอร์มของตัวละครยังไม่ได้บันทึก เพราะการเปลี่ยนรูปทำให้รายการได้รุ่นใหม่
 */
function OcImage({ oc, pale, locked, accept, kind = 'ocs' }: { oc: Pick<Oc, 'id' | 'rev' | 'name' | 'image'>; pale: string; locked: boolean; accept: (result: Result) => Result; kind?: ImageKind }) {
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
    <div className={`oc-image${kind === 'people' ? ' round' : ''}`}>
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
          if (file) void apply(setOcImage(oc, file, kind))
        }}
      />
      <button type="button" className="btn mini butter" disabled={busy || locked} onClick={() => input.current?.click()}>
        {busy ? 'กำลังทำ…' : image ? 'เปลี่ยนรูป' : 'ใส่รูป'}
      </button>
      {image && (
        <button type="button" className="btn mini" disabled={busy || locked} onClick={() => apply(removeOcImage(oc, kind))}>
          เอารูปออก
        </button>
      )}
      <p className="tiny">{locked ? 'บันทึกข้อมูลก่อน จึงจะเปลี่ยนรูปได้' : 'PNG หรือ JPEG มีผลทันที'}</p>
      {error && (
        <p className="tiny error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

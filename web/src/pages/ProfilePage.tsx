import { useState } from 'react'
import { FxBurst } from '../components/Fx'
import { FableCard } from '../components/FableCard'
import { ProfileEditor } from '../components/ProfileEditor'
import { FABLE_CAST } from '../lib/fables'
import { FX_EVENTS, FX_LEVEL, FX_TYPES, setFx, useFxPrefs, type FxEventKind, type FxType } from '../lib/fx'
import { useMe } from '../lib/me'
import {
  MAX_SLOTS,
  SET_FILTERS,
  setById,
  SETS,
  updateSetPrefs,
  useSetPrefs,
  VS,
  withActive,
  withAddedSlot,
  withoutSlot,
  withSlot,
  pieceSvg,
  type BoardSet,
  type SetColor,
} from '../lib/pieceSets'
import {
  CHESS_KINDS,
  KIND_NAMES,
  allStyles,
  effectiveStyle,
  setAllPieceStyles,
  setPieceStyle,
  stylesFor,
  useStylePrefs,
} from '../lib/pieceStyles'
import { loginAvailable } from '../lib/session'

interface Props {
  navigate: (to: string) => void
}

export function ProfilePage({ navigate }: Props) {
  const me = useMe()

  return (
    <main className="screen wide" style={{ gap: 20 }}>
      <h1 className="title">โปรไฟล์ของฉัน</h1>

      {me.loading ? (
        <p className="card" role="status">
          กำลังโหลดโปรไฟล์…
        </p>
      ) : me.email !== null ? (
        <ProfileEditor />
      ) : (
        <section className="card">
          <h2 className="card-title">ชื่อและรูปโปรไฟล์</h2>
          <p className="pretty">
            ตอนนี้คุณยังไม่ได้เข้าสู่ระบบ
            {loginAvailable
              ? ' ถ้าเข้าสู่ระบบจะตั้งชื่อและรูปให้คู่แข่งเห็นได้ ส่วนชุดหมากรุกและเอฟเฟกต์ด้านล่างใช้ได้เลย ไม่ต้องมีบัญชี'
              : ' ชุดหมากรุกและเอฟเฟกต์ด้านล่างใช้ได้เลย'}
          </p>
          {loginAvailable && (
            <div className="row wrap">
              <button type="button" className="btn" onClick={() => navigate('/login')}>
                เข้าสู่ระบบ
              </button>
              <button type="button" className="btn butter" onClick={() => navigate('/register')}>
                สมัครสมาชิก
              </button>
            </div>
          )}
        </section>
      )}

      <SetSlots />
      <Effects />
    </main>
  )
}

/** ชุดที่เก็บไว้ (สูงสุด 5 ช่อง) และคลังชุดทั้งหมด */
function SetSlots() {
  const { slots, active } = useSetPrefs()
  const [editing, setEditing] = useState(active)
  const [filter, setFilter] = useState<SetColor | 'all'>('all')
  const editSlot = Math.min(editing, slots.length - 1)

  return (
    <>
      <section className="card">
        <div className="row wrap" style={{ alignItems: 'baseline' }}>
          <h2 className="subtitle grow">ชุดหมากรุกของฉัน</h2>
          <p className="small">
            กดเลือกช่อง แล้วเลือกชุดจากคลังด้านล่าง ใช้ไปแล้ว {slots.length} จาก {MAX_SLOTS} ช่อง
          </p>
        </div>
        <div className="slot-grid">
          {slots.map((id, slot) => {
            const set = setById(id)
            const isActive = slot === active
            return (
              <div key={slot} className={`slot${slot === editSlot ? ' editing' : ''}`}>
                <button
                  type="button"
                  className="slot-pick"
                  aria-pressed={slot === editSlot}
                  aria-label={`แก้ชุดที่ ${slot + 1}: ${set.name}`}
                  onClick={() => setEditing(slot)}
                >
                  <FableCard set={set} />
                  <span>
                    <span className="tiny" style={{ display: 'block' }}>
                      ชุดที่ {slot + 1}
                    </span>
                    <span className="set-tale">“{set.tale}”</span>
                    {FABLE_CAST[set.id] && (
                      <span className="tiny" style={{ display: 'block' }}>
                        เบี้ยเป็น{FABLE_CAST[set.id][0]}กับ{FABLE_CAST[set.id][1]}
                      </span>
                    )}
                  </span>
                </button>
                <div className="row">
                  <button
                    type="button"
                    className={`btn mini grow${isActive ? ' mint' : ''}`}
                    aria-pressed={isActive}
                    onClick={() => updateSetPrefs((p) => withActive(p, slot))}
                  >
                    {isActive ? 'ใช้อยู่' : 'ใช้ชุดนี้'}
                  </button>
                  {slots.length > 1 && (
                    <button
                      type="button"
                      className="close"
                      aria-label={`ลบชุดที่ ${slot + 1}`}
                      onClick={() => {
                        updateSetPrefs((p) => withoutSlot(p, slot))
                        setEditing((e) => (e === slot ? 0 : e > slot ? e - 1 : e))
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {slots.length < MAX_SLOTS && (
            <button
              type="button"
              className="slot-add"
              onClick={() => {
                updateSetPrefs(withAddedSlot)
                setEditing(slots.length)
              }}
            >
              <span style={{ fontSize: 34 }} aria-hidden="true">
                +
              </span>
              เพิ่มชุด
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="subtitle">คลังชุดหมากรุก</h2>
        <div className="row wrap" role="group" aria-label="กรองตามสี">
          {SET_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="chip dark"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              <span className="swatch" style={{ width: 22, height: 22, background: f.swatch }} />
              {f.label}
            </button>
          ))}
        </div>
        <div className="catalog">
          {SETS.filter((s) => filter === 'all' || s.color === filter).map((set) => {
            const on = set.id === slots[editSlot]
            return (
              <button
                key={set.id}
                type="button"
                className="catalog-item"
                aria-pressed={on}
                aria-label={`ใส่ชุด${set.name}ในชุดที่ ${editSlot + 1}`}
                onClick={() => updateSetPrefs((p) => withSlot(p, editSlot, set.id))}
              >
                <FableCard set={set} />
                <span className="set-tale">“{set.tale}”</span>
              </button>
            )
          })}
        </div>
      </section>

      <PieceStyleSection set={setById(slots[active])} />
    </>
  )
}

/** เลือกเอฟเฟกต์ของแต่ละเหตุการณ์ กดแล้วเล่นตัวอย่างในปุ่ม */
function Effects() {
  const prefs = useFxPrefs()
  const [preview, setPreview] = useState<{ event: FxEventKind; type: FxType; seed: number } | null>(null)

  return (
    <section className="card" style={{ gap: 4 }}>
      <div className="row wrap" style={{ alignItems: 'baseline', marginBottom: 6 }}>
        <h2 className="subtitle grow">เอฟเฟกต์</h2>
        <p className="small">กดเพื่อเลือกและดูตัวอย่าง</p>
      </div>
      {FX_EVENTS.map((ev) => (
        <div key={ev.id} className="fx-row">
          <div className="row wrap" style={{ alignItems: 'baseline' }} id={`fx-${ev.id}`}>
            <span className="card-title" style={{ fontSize: 17 }}>
              {ev.label}
            </span>
            <span className="small">{ev.desc}</span>
          </div>
          <div className="fx-options" role="group" aria-labelledby={`fx-${ev.id}`}>
            {FX_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className="fx-option"
                aria-pressed={prefs[ev.id] === t.id}
                onClick={() => {
                  setFx(ev.id, t.id)
                  setPreview({ event: ev.id, type: t.id, seed: Date.now() % 100000 })
                }}
              >
                <span className="fx-icon" style={{ color: t.color }} aria-hidden="true">
                  {t.icon + VS}
                </span>
                <span className="tiny" style={{ fontWeight: 700 }}>
                  {t.name}
                </span>
                {preview && preview.event === ev.id && preview.type === t.id && (
                  <FxBurst key={preview.seed} type={t.id} seed={preview.seed} dist={40} level={FX_LEVEL[ev.id].level} />
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

/**
 * เลือกรูปแบบ (รูปทรง) ของตัวหมากรุกเป็นรายตัว เช่น คิงใช้แบบหนึ่ง ม้าใช้อีกแบบหนึ่ง
 * รูปแบบใหม่ที่เพิ่มในระบบภายหลังจะขึ้นให้เลือกที่นี่เอง ใช้กับหมากรุกสากลและหมากรุกไทย
 */
function PieceStyleSection({ set }: { set: BoardSet }) {
  const prefs = useStylePrefs()
  return (
    <section className="card" aria-labelledby="piece-style-title">
      <div className="row wrap" style={{ alignItems: 'baseline' }}>
        <h2 className="subtitle grow" id="piece-style-title">
          รูปแบบตัวหมากรุก
        </h2>
        <p className="small">เลือกได้ทีละตัว ใช้กับหมากรุกสากลและหมากรุกไทย</p>
      </div>

      <div className="row wrap" role="group" aria-label="ใช้รูปแบบเดียวกันทุกตัว">
        <span className="small" style={{ fontWeight: 700 }}>
          ใช้แบบเดียวกันทุกตัว
        </span>
        {allStyles().map((style) => (
          <button
            key={style.id}
            type="button"
            className="chip dark style-all"
            aria-pressed={CHESS_KINDS.every((k) => effectiveStyle(prefs[k], k).id === style.id)}
            title={style.desc}
            onClick={() => setAllPieceStyles(style.id)}
          >
            {style.name}
          </button>
        ))}
      </div>

      <div className="style-rows">
        {CHESS_KINDS.map((kind) => (
          <div key={kind} className="style-row" role="group" aria-label={`รูปแบบของ${KIND_NAMES[kind]}`}>
            <b className="style-kind">{KIND_NAMES[kind]}</b>
            <div className="style-options">
              {stylesFor(kind).map((style) => (
                <button
                  key={style.id}
                  type="button"
                  className="style-option"
                  aria-pressed={effectiveStyle(prefs[kind], kind).id === style.id}
                  aria-label={`${KIND_NAMES[kind]}แบบ${style.name}`}
                  title={style.desc}
                  onClick={() => setPieceStyle(kind, style.id)}
                >
                  <span className="style-pair" aria-hidden="true">
                    <span style={{ background: set.dark }}>{pieceSvg(set, 'w', kind, { badge: false, styles: { ...prefs, [kind]: style.id } })}</span>
                    <span style={{ background: set.light }}>{pieceSvg(set, 'b', kind, { badge: false, styles: { ...prefs, [kind]: style.id } })}</span>
                  </span>
                  <span className="tiny">{style.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

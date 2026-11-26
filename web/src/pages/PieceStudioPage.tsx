import { useCallback, useEffect, useRef, useState } from 'react'
import { useRoles } from '../lib/admin'
import {
  createStyle,
  deleteStyle,
  fetchStyles,
  removePieceImage,
  renameStyle,
  setPieceImage,
  STYLE_NAME_MAX,
  type PieceResult,
} from '../lib/pieceAdmin'
import { CHESS_KINDS, KIND_NAMES, readyKinds, type RemoteStyle } from '../lib/pieceStyles'
import { loginAvailable } from '../lib/session'

interface Props {
  navigate: (to: string) => void
}

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; styles: RemoteStyle[] }
type Notice = { kind: 'ok' | 'error'; text: string } | null

const COLORS = [
  { id: 'w', name: 'ขาว' },
  { id: 'b', name: 'ดำ' },
] as const

/**
 * หน้าจัดการรูปแบบตัวหมาก สำหรับบทบาท "ผู้จัดการรูปแบบหมาก" (แยกจาก admin กำหนดด้วย PIECE_EDITOR_EMAILS)
 * เพิ่มรูปแบบใหม่นอกเหนือจากรูปแบบเริ่มต้นของระบบ แล้วใส่รูปของหมากทีละตัว (6 ชนิด × 2 สี)
 * ทุกการกระทำมีผลทันทีและแก้ทีละรายการ ถ้ามีคนอื่นแก้รูปแบบเดียวกันไปก่อน เซิร์ฟเวอร์จะปฏิเสธและส่งข้อมูลล่าสุดกลับมา
 * เซิร์ฟเวอร์ตรวจบทบาทและตรวจไฟล์ทุกครั้ง หน้านี้ซ่อนไว้จากคนอื่นเพื่อความสะดวกเท่านั้น
 */
export function PieceStudioPage({ navigate }: Props) {
  const roles = useRoles()

  if (roles === null) {
    return (
      <main className="screen">
        <p className="card center" role="status">
          กำลังตรวจสิทธิ์…
        </p>
      </main>
    )
  }
  if (!roles.pieces) {
    return (
      <main className="screen">
        <h1 className="title">จัดการรูปแบบหมาก</h1>
        <section className="card">
          <p className="pretty">หน้านี้สำหรับผู้จัดการรูปแบบหมากเท่านั้น ถ้าคุณมีบทบาทนี้ ให้เข้าสู่ระบบด้วยบัญชีที่ได้รับสิทธิ์</p>
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
  return <Studio navigate={navigate} />
}

function Studio({ navigate }: Props) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [notice, setNotice] = useState<Notice>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    return fetchStyles()
      .then((styles) => setLoad({ state: 'ready', styles }))
      .catch(() => setLoad({ state: 'failed' }))
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /** รับผลจากเซิร์ฟเวอร์: อัปเดตรายการ และแจ้งผล คืนผลเดิมให้ผู้เรียกใช้ต่อ */
  const accept = useCallback((result: PieceResult, done: string): PieceResult => {
    if (result.status === 'ok') {
      setLoad({ state: 'ready', styles: result.styles })
      setNotice({ kind: 'ok', text: done })
    } else {
      if (result.status === 'conflict' && result.styles) setLoad({ state: 'ready', styles: result.styles })
      setNotice({ kind: 'error', text: result.message })
    }
    return result
  }, [])

  async function add() {
    const trimmed = name.trim()
    if (trimmed === '') {
      setNotice({ kind: 'error', text: 'ตั้งชื่อรูปแบบก่อน' })
      return
    }
    setBusy(true)
    const result = accept(await createStyle(trimmed), `เพิ่มรูปแบบ "${trimmed}" แล้ว ใส่รูปของหมากแต่ละตัวได้เลย`)
    setBusy(false)
    if (result.status === 'ok') setName('')
  }

  return (
    <main className="screen wide studio" style={{ gap: 16 }}>
      <div className="row wrap" style={{ alignItems: 'center' }}>
        <h1 className="title grow">จัดการรูปแบบหมาก</h1>
        <button type="button" className="btn mini" onClick={() => navigate('/profile')}>
          ดูในหน้าโปรไฟล์
        </button>
      </div>
      <p className="small pretty">
        รูปแบบที่เพิ่มที่นี่จะขึ้นให้ผู้เล่นเลือกเป็นรายตัวในหน้าโปรไฟล์ ต่อจากรูปแบบเริ่มต้นของระบบ (ซึ่งแก้จากหน้านี้ไม่ได้)
        หมากชนิดหนึ่งจะขึ้นให้เลือกเมื่อมีรูปครบทั้งสีขาวและสีดำ ใช้รูป PNG พื้นโปร่งทรงจัตุรัสจะสวยที่สุด
      </p>

      {notice && (
        <p className={notice.kind === 'ok' ? 'notice' : 'error'} role={notice.kind === 'ok' ? 'status' : 'alert'}>
          {notice.text}
        </p>
      )}

      <section className="card" aria-label="เพิ่มรูปแบบใหม่">
        <form
          className="row wrap studio-add"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <label className="field grow" htmlFor="style-name">
            ชื่อรูปแบบใหม่
            <input id="style-name" className="input" value={name} maxLength={STYLE_NAME_MAX} placeholder="เช่น ชุดการ์ตูน" onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="btn butter" disabled={busy}>
            {busy ? 'กำลังเพิ่ม…' : '+ เพิ่มรูปแบบ'}
          </button>
        </form>
      </section>

      {load.state === 'loading' && (
        <p className="card center" role="status">
          กำลังโหลด…
        </p>
      )}
      {load.state === 'failed' && (
        <section className="card">
          <p className="error" role="alert">
            โหลดรูปแบบไม่ได้
          </p>
          <button type="button" className="btn" onClick={() => void reload()}>
            ลองใหม่
          </button>
        </section>
      )}
      {load.state === 'ready' && load.styles.length === 0 && <p className="card center">ยังไม่มีรูปแบบที่เพิ่มไว้</p>}
      {load.state === 'ready' && load.styles.map((style) => <StyleCard key={style.id} style={style} accept={accept} />)}
    </main>
  )
}

function StyleCard({ style, accept }: { style: RemoteStyle; accept: (result: PieceResult, done: string) => PieceResult }) {
  // ชื่อที่กำลังพิมพ์ ผูกกับเลขรุ่น: เมื่อรายการได้รุ่นใหม่จากเซิร์ฟเวอร์ ช่องกลับไปแสดงชื่อล่าสุด
  const [draft, setDraft] = useState({ rev: style.rev, name: style.name })
  const [busy, setBusy] = useState('')
  const [confirming, setConfirming] = useState(false)
  if (draft.rev !== style.rev) setDraft({ rev: style.rev, name: style.name })

  const ready = readyKinds(style)
  const changed = draft.name.trim() !== style.name

  async function run(key: string, action: Promise<PieceResult>, done: string) {
    setBusy(key)
    accept(await action, done)
    setBusy('')
  }

  return (
    <section className="card studio-style" aria-label={`รูปแบบ ${style.name}`}>
      <div className="row wrap" style={{ alignItems: 'flex-end' }}>
        <label className="field grow" htmlFor={`name-${style.id}`}>
          ชื่อรูปแบบ
          <input
            id={`name-${style.id}`}
            className="input"
            value={draft.name}
            maxLength={STYLE_NAME_MAX}
            onChange={(e) => setDraft({ rev: style.rev, name: e.target.value })}
          />
        </label>
        <button
          type="button"
          className="btn mini butter"
          disabled={!changed || draft.name.trim() === '' || busy !== ''}
          onClick={() => run('name', renameStyle(style, draft.name.trim()), 'เปลี่ยนชื่อแล้ว')}
        >
          {busy === 'name' ? 'กำลังบันทึก…' : 'บันทึกชื่อ'}
        </button>
        {confirming ? (
          <>
            <button type="button" className="btn mini pink" disabled={busy !== ''} onClick={() => run('delete', deleteStyle(style), `ลบรูปแบบ "${style.name}" และรูปทั้งหมดของรูปแบบนี้แล้ว`)}>
              {busy === 'delete' ? 'กำลังลบ…' : 'ยืนยันลบ'}
            </button>
            <button type="button" className="btn mini" onClick={() => setConfirming(false)}>
              ไม่ลบ
            </button>
          </>
        ) : (
          <button type="button" className="btn mini" disabled={busy !== ''} onClick={() => setConfirming(true)}>
            ลบรูปแบบ
          </button>
        )}
      </div>
      <p className="small" role="status">
        {ready.length === 0
          ? 'ยังไม่ขึ้นให้ผู้เล่นเลือก: ต้องมีหมากอย่างน้อยหนึ่งชนิดที่มีรูปครบสองสี'
          : `ผู้เล่นเลือกได้แล้ว ${ready.length}/6 ชนิด: ${ready.map((k) => KIND_NAMES[k]).join(' ')}`}
      </p>

      <div className="studio-grid">
        {COLORS.map((color) =>
          CHESS_KINDS.map((kind) => {
            const piece = color.id + kind
            return (
              <PieceSlot
                key={piece}
                label={`${KIND_NAMES[kind]}${color.name}`}
                dark={color.id === 'w'}
                image={style.images[piece]}
                busy={busy === piece}
                disabled={busy !== ''}
                onPick={(file) => run(piece, setPieceImage(style, piece, file), `ใส่รูป${KIND_NAMES[kind]}${color.name}แล้ว`)}
                onRemove={() => run(piece, removePieceImage(style, piece), `เอารูป${KIND_NAMES[kind]}${color.name}ออกแล้ว`)}
              />
            )
          }),
        )}
      </div>
    </section>
  )
}

/** ช่องรูปของหมากหนึ่งตัว: ตัวอย่างบนพื้นช่องกระดาน ปุ่มใส่หรือเปลี่ยนรูป และปุ่มเอาออก */
function PieceSlot({
  label,
  dark,
  image,
  busy,
  disabled,
  onPick,
  onRemove,
}: {
  label: string
  /** หมากขาวแสดงบนช่องเข้ม หมากดำบนช่องอ่อน ให้เห็นขอบชัด */
  dark: boolean
  image: string | undefined
  busy: boolean
  disabled: boolean
  onPick: (file: File) => void
  onRemove: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="studio-slot">
      <b className="tiny">{label}</b>
      <div className={`studio-preview${dark ? ' dark' : ''}`}>{image ? <img src={image} alt={`รูป${label}`} draggable={false} /> : <span aria-hidden="true">?</span>}</div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          e.target.value = ''
        }}
      />
      <button type="button" className="btn mini butter" disabled={disabled} aria-label={`${image ? 'เปลี่ยน' : 'ใส่'}รูป${label}`} onClick={() => input.current?.click()}>
        {busy ? 'กำลังทำ…' : image ? 'เปลี่ยน' : 'ใส่รูป'}
      </button>
      {image && (
        <button type="button" className="btn mini" disabled={disabled} aria-label={`เอารูป${label}ออก`} onClick={onRemove}>
          เอาออก
        </button>
      )}
    </div>
  )
}

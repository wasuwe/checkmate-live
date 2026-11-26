import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { clampView, coverScale, MAX_ZOOM, MIN_ZOOM, outputSize, panView, sourceRect, START_VIEW, type CropView, type Size } from '../lib/crop'

interface Props {
  /** ไฟล์รูปที่ผู้ใช้เลือก */
  file: Blob
  /** สัดส่วนกว้าง/สูงของกรอบ เช่น 1 = จัตุรัส, 0.75 = แนวตั้ง 3:4 */
  aspect: number
  title: string
  /** กรอบเป็นวงกลม (รูปโปรไฟล์) ผลลัพธ์ยังเป็นสี่เหลี่ยม วงกลมแค่ช่วยให้เห็นว่าจะแสดงอย่างไร */
  round?: boolean
  /** ด้านยาวสุดของผลลัพธ์ (พิกเซล) */
  maxSide?: number
  /** แสดงปุ่ม "ใช้ทั้งรูป" (ส่งไฟล์เดิมโดยไม่ครอป) */
  allowWhole?: boolean
  onDone: (image: Blob) => void
  onCancel: () => void
}

/** ความกว้างสูงสุดของกรอบบนจอ */
const FRAME_MAX = 300

/**
 * หน้าต่างครอปรูปก่อนอัปโหลด: ลากเพื่อเลื่อนรูป ใช้แถบเลื่อน ล้อเมาส์ หรือปุ่มลูกศรเพื่อซูมและขยับ
 * กรอบมีสัดส่วนคงที่ตามที่ที่รูปจะไปแสดง ผลลัพธ์เป็น PNG (คงพื้นโปร่ง) ส่งต่อให้ขั้นตอนอัปโหลดเดิม
 */
export function CropDialog({ file, aspect, title, round = false, maxSide = 1600, allowWhole = false, onDone, onCancel }: Props) {
  const [url, setUrl] = useState('')
  const [image, setImage] = useState<Size | null>(null)
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState<CropView>(START_VIEW)
  const [busy, setBusy] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)

  // กรอบเล็กลงบนจอแคบ ขนาดนี้ต้องตรงกับที่แสดงจริง เพราะใช้คำนวณส่วนที่ครอป
  const [side] = useState(() => Math.max(180, Math.min(FRAME_MAX, window.innerWidth - 110)))
  const frame: Size = aspect >= 1 ? { width: side, height: side / aspect } : { width: side * aspect, height: side }

  useEffect(() => {
    const next = URL.createObjectURL(file)
    let alive = true
    // ตั้งค่าหลัง effect จบ (ไม่ตั้ง state ตรง ๆ ใน effect) และไม่ใช้ URL ที่ถูกยกเลิกไปแล้ว
    void Promise.resolve().then(() => alive && setUrl(next))
    return () => {
      alive = false
      URL.revokeObjectURL(next)
    }
  }, [file])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const update = (next: CropView) => image && setView(clampView(next, image, frame))

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!image) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY }
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!image || !drag.current) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    drag.current = { x: e.clientX, y: e.clientY }
    setView((v) => panView(v, dx, dy, image, frame))
  }
  function onPointerUp() {
    drag.current = null
  }

  async function confirm() {
    const img = imgRef.current
    if (!image || !img) return
    setBusy(true)
    try {
      const rect = sourceRect(view, image, frame)
      const out = outputSize(rect, maxSide)
      const canvas = document.createElement('canvas')
      canvas.width = out.width
      canvas.height = out.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no canvas')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, out.width, out.height)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/png'))
      onDone(blob)
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  // ตำแหน่งของรูปใต้กรอบ
  const scale = image ? coverScale(image, frame) * view.zoom : 1
  const shown = image ? { width: image.width * scale, height: image.height * scale } : { width: 0, height: 0 }
  const left = image ? frame.width / 2 - view.cx * shown.width : 0
  const top = image ? frame.height / 2 - view.cy * shown.height : 0
  const step = 0.04 / view.zoom

  // วาดที่ body โดยตรง: การ์ดที่เรียกใช้มีการเคลื่อนไหว (transform) ซึ่งจะขังหน้าต่างแบบ fixed ไว้ในการ์ด
  return createPortal(
    // กดพื้นหลังไม่ปิด: ลากรูปแล้วปล่อยนอกกรอบได้บ่อย ถ้าปิดจะเสียสิ่งที่จัดไว้ (ปิดด้วยปุ่มยกเลิกหรือ Escape)
    <div className="overlay crop-overlay">
      <div className="dialog narrow crop-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="dialog-title">{title}</h2>
        {failed ? (
          <p className="error" role="alert">
            เปิดไฟล์นี้เป็นรูปไม่ได้ ใช้ได้เฉพาะรูป PNG, JPEG หรือ WebP
          </p>
        ) : (
          <>
            <div
              className={`crop-frame${round ? ' round' : ''}`}
              style={{ width: frame.width, height: frame.height }}
              tabIndex={0}
              role="group"
              aria-label="ลากเพื่อเลื่อนรูป หรือใช้ปุ่มลูกศร"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={(e) => update({ ...view, zoom: view.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08) })}
              onKeyDown={(e) => {
                const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
                const d = move[e.key]
                if (!d) return
                e.preventDefault()
                update({ ...view, cx: view.cx + d[0], cy: view.cy + d[1] })
              }}
            >
              {url && (
                <img
                  ref={imgRef}
                  src={url}
                  alt=""
                  draggable={false}
                  style={{ left, top, width: shown.width || undefined, height: shown.height || undefined, visibility: image ? 'visible' : 'hidden' }}
                  onLoad={(e) => {
                    const el = e.currentTarget
                    if (el.naturalWidth < 1 || el.naturalHeight < 1) setFailed(true)
                    else setImage({ width: el.naturalWidth, height: el.naturalHeight })
                  }}
                  onError={() => setFailed(true)}
                />
              )}
            </div>
            <label className="field crop-zoom" htmlFor="crop-zoom">
              ซูม
              <input
                id="crop-zoom"
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={view.zoom}
                disabled={!image}
                onChange={(e) => update({ ...view, zoom: Number(e.target.value) })}
              />
            </label>
            <p className="tiny">ลากรูปเพื่อเลื่อน · ส่วนที่อยู่ในกรอบคือส่วนที่จะถูกใช้</p>
          </>
        )}
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          {!failed && (
            <button type="button" className="btn pink" disabled={!image || busy} onClick={() => void confirm()}>
              {busy ? 'กำลังเตรียมรูป…' : 'ใช้รูปนี้'}
            </button>
          )}
          {allowWhole && !failed && (
            <button type="button" className="btn mini" disabled={busy} onClick={() => onDone(file)}>
              ใช้ทั้งรูป ไม่ครอป
            </button>
          )}
          <button type="button" className="btn mini" disabled={busy} onClick={onCancel}>
            ยกเลิก
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

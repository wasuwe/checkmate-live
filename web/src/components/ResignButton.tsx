import { useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  disabled: boolean
  onResign: () => void
}

/** ปุ่มยอมแพ้ พร้อมกล่องยืนยันเพราะย้อนกลับไม่ได้ */
export function ResignButton({ disabled, onResign }: Props) {
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <button type="button" className="btn mini danger" disabled={disabled} onClick={() => setConfirming(true)}>
        ยอมแพ้
      </button>
      {/* วางที่ body: ปุ่มนี้อยู่ในแผงข้างกระดาน ซึ่งส่วนอื่นของแผงจะทับกล่องยืนยันถ้าวางไว้ข้างใน */}
      {confirming &&
        createPortal(
          <div className="overlay" onClick={() => setConfirming(false)}>
            <div
              className="dialog narrow"
              role="dialog"
              aria-modal="true"
              aria-labelledby="resign-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="dialog-title" id="resign-title">
                ยอมแพ้เกมนี้?
              </h2>
              <p>คู่แข่งจะชนะทันที และย้อนกลับไม่ได้</p>
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn mint" autoFocus onClick={() => setConfirming(false)}>
                  เล่นต่อ
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    setConfirming(false)
                    onResign()
                  }}
                >
                  ยืนยันยอมแพ้
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

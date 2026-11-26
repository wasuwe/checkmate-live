import { useState } from 'react'

interface Props {
  disabled: boolean
  onResign: () => void
}

/** ปุ่มยอมแพ้ พร้อมกล่องยืนยันเพราะย้อนกลับไม่ได้ */
export function ResignButton({ disabled, onResign }: Props) {
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <button type="button" className="danger" disabled={disabled} onClick={() => setConfirming(true)}>
        ยอมแพ้
      </button>
      {confirming && (
        <div className="overlay fixed" role="dialog" aria-modal="true" aria-labelledby="resign-title">
          <div className="dialog">
            <h2 id="resign-title">ยอมแพ้เกมนี้?</h2>
            <p>คู่แข่งจะชนะทันที และย้อนกลับไม่ได้</p>
            <div className="row">
              <button type="button" autoFocus onClick={() => setConfirming(false)}>
                เล่นต่อ
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setConfirming(false)
                  onResign()
                }}
              >
                ยืนยันยอมแพ้
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

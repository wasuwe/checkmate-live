import { useEffect } from 'react'
import { TOSS_TOTAL_MS, type TossView } from '../lib/toss'

interface Props {
  view: TossView
  /** เรียกเมื่อภาพเล่นจบ หรือผู้ใช้กดข้าม */
  onDone: () => void
}

/**
 * ภาพโยนเหรียญตอนเริ่มเกม (สุ่มฝ่ายขาว–ดำ หรือหาคนเริ่มก่อน ตาม view): เหรียญถูกดีดขึ้น หมุน ตกลงมาโคลงเคลง แล้วหยุดให้เห็นด้านที่ออก
 * การเคลื่อนไหวทั้งหมดอยู่ใน CSS (.coin, .coin-lift) ถ้าเครื่องปิดการเคลื่อนไหว เหรียญจะแสดงผลทันที
 */
export function CoinToss({ view, onDone }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDone, TOSS_TOTAL_MS)
    return () => clearTimeout(timer)
  }, [onDone])

  return (
    <div className="overlay toss" onClick={onDone}>
      <div className="toss-box" role="status" aria-live="polite">
        <p className="toss-title">{view.title}</p>
        <div className="coin-stage" aria-hidden="true">
          <div className="coin-lift">
            <div className={`coin lands-${view.landsOn}${view.faces === 'colors' ? ' colors' : ''}`}>
              <div className="coin-face front">{view.front}</div>
              <div className="coin-face back">{view.back}</div>
            </div>
          </div>
          <div className="coin-shadow" />
        </div>
        <p className="toss-result">{view.result}</p>
        <p className="tiny toss-skip">แตะเพื่อข้าม</p>
      </div>
    </div>
  )
}

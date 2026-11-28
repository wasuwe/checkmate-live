import { useEffect } from 'react'
import { FABLE_CAST } from '../lib/fables'
import { heroSvg, sideSets, useSetPrefs } from '../lib/pieceSets'
import { TOSS_TOTAL_MS, type TossPage, type TossView } from '../lib/toss'

interface Props {
  view: TossView
  /** เรียกเมื่อภาพเล่นจบ หรือผู้ใช้กดข้าม */
  onDone: () => void
}

/**
 * ฉากเปิดเกม: หนังสือนิทานเปิดออกกลางท้องฟ้ายามค่ำ (เจ้าของโปรเจกต์กำหนด 2026-11-28: หน้าสุ่มฝ่ายเดิมธรรมดาเกินไป
 * อยากได้ความรู้สึกว่ากำลังเข้าสู่โลกนิทาน) หน้าซ้ายขวาเป็นผู้เล่นสองฝั่งกับตัวละครนิทานของชุดที่แต่ละคนเลือก
 * เหรียญถูกโยนเหนือสันหนังสือ (สุ่มฝ่ายขาวดำ หรือหาคนเดินก่อน ตาม view) พอเหรียญหยุด ริบบิ้นบอกฝ่ายขึ้นที่หน้าของแต่ละคน
 * แล้วภาพพุ่งเข้าไปในหนังสือก่อนเผยกระดาน การเคลื่อนไหวทั้งหมดอยู่ใน CSS (.story-*, .coin)
 * ถ้าเครื่องปิดการเคลื่อนไหว ทุกอย่างแสดงผลทันที
 */
export function CoinToss({ view, onDone }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDone, TOSS_TOTAL_MS)
    return () => clearTimeout(timer)
  }, [onDone])

  const { set: local } = useSetPrefs()
  const [left, right] = view.pages
  const sets = sideSets(local, { [left.color]: { set: left.set }, [right.color]: { set: right.set } })
  const cast = (page: TossPage) => FABLE_CAST[sets[page.color].id]?.[page.color === 'w' ? 0 : 1]
  const meeting = cast(left) && cast(right) ? `${cast(left)}ได้พบกับ${cast(right)}` : ''

  const pageOf = (page: TossPage, side: 'left' | 'right') => (
    <div className={`story-page ${side}`}>
      <span className="story-ribbon">{page.ribbon}</span>
      <div className="story-hero" aria-hidden="true">
        {heroSvg(sets[page.color], page.color, { className: 'story-hero-piece' })}
      </div>
      <b className="story-name">{page.name}</b>
      {page.you && <span className="story-you">คุณ</span>}
    </div>
  )

  return (
    <div className="overlay toss" onClick={onDone}>
      <div className="story-sky" aria-hidden="true" />
      <div className="story-scene" role="status" aria-live="polite">
        <p className="story-once">กาลครั้งหนึ่ง</p>
        {meeting && <p className="story-meeting">{meeting}</p>}
        <div className="story-book">
          {pageOf(left, 'left')}
          {pageOf(right, 'right')}
          <div className="coin-stage" aria-hidden="true">
            <div className="coin-lift">
              <div className={`coin lands-${view.landsOn}${view.faces === 'colors' ? ' colors' : ''}`}>
                <div className="coin-face front">{view.front}</div>
                <div className="coin-face back">{view.back}</div>
              </div>
            </div>
            <div className="coin-shadow" />
          </div>
        </div>
        <p className="toss-title">{view.title}</p>
        <p className="toss-result">{view.result}</p>
        <p className="tiny toss-skip">แตะเพื่อข้าม</p>
      </div>
    </div>
  )
}

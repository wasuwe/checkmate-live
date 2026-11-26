import { goBack } from '../lib/router'
import { setTermsAccepted, TERMS, TERMS_UPDATED } from '../lib/terms'

interface Props {
  navigate: (to: string) => void
}

const COLORS = ['#FFB8CC', '#9FE3C9', '#C9BDFF', '#FFDC85', '#A9D6F7']

export function TermsPage({ navigate }: Props) {
  return (
    <main className="screen medium" style={{ gap: 16 }}>
      <h1 className="title">ข้อตกลงการใช้งาน</h1>
      <p className="small">ปรับปรุงล่าสุด {TERMS_UPDATED}</p>
      <ol className="card terms-list" style={{ listStyle: 'none', margin: 0 }}>
        {TERMS.map((t, i) => (
          <li key={t.title} className="terms-item">
            <div className="num" style={{ background: COLORS[i % COLORS.length] }} aria-hidden="true">
              {i + 1}
            </div>
            <div>
              <h2 className="card-title">{t.title}</h2>
              <p className="pretty" style={{ fontSize: 15, lineHeight: 1.6 }}>
                {t.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn mint strong"
        style={{ alignSelf: 'flex-end' }}
        onClick={() => {
          setTermsAccepted(true)
          goBack(navigate)
        }}
      >
        ยอมรับข้อตกลง
      </button>
    </main>
  )
}

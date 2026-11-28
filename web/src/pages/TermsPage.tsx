import { goBack } from '../lib/router'
import { keepThaiWords } from '../lib/thaiBreak'
import { setTermsAccepted, TERMS, TERMS_UPDATED } from '../lib/terms'

interface Props {
  navigate: (to: string) => void
}

export function TermsPage({ navigate }: Props) {
  return (
    <main className="screen medium" style={{ gap: 16 }}>
      <h1 className="title">ข้อตกลงการใช้งาน</h1>
      <p className="small">ปรับปรุงล่าสุด {TERMS_UPDATED}</p>
      <ol className="card terms-list" style={{ listStyle: 'none', margin: 0 }}>
        {TERMS.map((t, i) => (
          <li key={t.title} className="terms-item">
            <div className="num" aria-hidden="true">
              {i + 1}
            </div>
            <div>
              <h2 className="card-title">{t.title}</h2>
              <p className="pretty" style={{ fontSize: 15, lineHeight: 1.6 }}>
                {keepThaiWords(t.body)}
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

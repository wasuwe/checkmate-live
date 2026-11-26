import { BADGE, GLYPH, useSetPrefs, VS } from '../lib/pieceSets'
import { reach, RULE_BASICS, RULE_PIECES, RULE_SPECIALS } from '../lib/rules'

interface Props {
  navigate: (to: string) => void
}

const BASIC_BG = ['#FFE8EF', '#E8FAF2', '#F1EDFF']

export function RulesPage({ navigate }: Props) {
  const { set } = useSetPrefs()

  return (
    <main className="screen wide" style={{ gap: 20 }}>
      <h1 className="title">กฎการเล่น · หมากรุกสากล</h1>

      <div className="rule-grid">
        {RULE_BASICS.map((b, i) => (
          <section key={b.title} className="rule-card" style={{ background: BASIC_BG[i % BASIC_BG.length] }}>
            <h2 className="card-title" style={{ fontWeight: 600 }}>
              {b.title}
            </h2>
            <p className="pretty" style={{ fontSize: 15, lineHeight: 1.6 }}>
              {b.body}
            </p>
          </section>
        ))}
      </div>

      <h2 className="subtitle">หมากแต่ละตัวเดินอย่างไร</h2>
      <div className="piece-grid">
        {RULE_PIECES.map((p) => (
          <section key={p.kind} className="card side piece-card">
            {/* กระดานตัวอย่างเป็นภาพประกอบ คำอธิบายข้าง ๆ บอกข้อมูลเดียวกันเป็นข้อความ */}
            <div className="mini-board five" aria-hidden="true">
              {Array.from({ length: 25 }, (_, i) => {
                const r = Math.floor(i / 5)
                const c = i % 5
                const mark = reach(p.kind, r - 2, c - 2)
                return (
                  <div key={i} style={{ background: (r + c) % 2 ? set.dark : set.light, color: set.w }}>
                    {i === 12 && GLYPH[p.kind] + VS}
                    {mark === 'dot' && <span className="mini-dot" />}
                    {mark === 'ring' && <span className="mini-ring" />}
                  </div>
                )
              })}
            </div>
            <div className="stack" style={{ gap: 6, minWidth: 0 }}>
              <div className="row">
                <span className="badge-icon" aria-hidden="true">
                  {BADGE[p.kind] + VS}
                </span>
                <h3 className="card-title" style={{ fontWeight: 600 }}>
                  {p.name}
                </h3>
              </div>
              <p className="small pretty" style={{ lineHeight: 1.55 }}>
                {p.desc}
              </p>
            </div>
          </section>
        ))}
      </div>

      <div className="legend">
        <span>
          <span className="mini-dot" style={{ position: 'static', width: 14, height: 14, borderWidth: 2 }} />
          ช่องที่เดินไปได้
        </span>
        <span>
          <span
            className="mini-ring"
            style={{ position: 'static', width: 16, height: 16, borderWidth: 3, borderRadius: 5 }}
          />
          ช่องที่กินได้
        </span>
      </div>

      <h2 className="subtitle">กติกาพิเศษ</h2>
      <div className="card side dashed-list">
        {RULE_SPECIALS.map((r) => (
          <div key={r.title}>
            <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 16 }}>{r.title}</h3>
            <p className="pretty" style={{ fontSize: 15, lineHeight: 1.6 }}>
              {r.body}
            </p>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn pink strong"
        style={{ alignSelf: 'center', padding: '14px 30px' }}
        onClick={() => navigate('/play')}
      >
        เข้าใจแล้ว ไปเล่นกัน
      </button>
    </main>
  )
}

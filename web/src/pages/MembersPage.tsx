import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminGate } from '../components/AdminGate'
import { Avatar } from '../components/Avatar'
import { describeTimeControl } from '../lib/clock'
import { gameName, isGameId } from '../lib/games'
import {
  fetchMember,
  fetchMembers,
  filterMembers,
  FILTERS,
  formatDate,
  formatDuration,
  GUEST_NAME,
  OUTCOME_TEXT,
  personLabel,
  SORTS,
  sortMembers,
  summarize,
  timeAgo,
  winRate,
  type Live,
  type Member,
  type MemberDetail,
  type MemberFilter,
  type MemberSort,
  type Stats,
} from '../lib/members'
import { ADMIN_PATH, roomPath } from '../lib/router'
import { colorName, formatRoomCode, reasonLabel } from '../lib/text'

interface Props {
  navigate: (to: string) => void
}

/** โหลดรายการใหม่เองทุกช่วงเวลานี้ เพื่อให้สถานะ "กำลังเล่น" ไม่ค้าง (เฉพาะตอนที่เปิดหน้านี้อยู่) */
const REFRESH_MS = 20_000
/** จำนวนเกมล่าสุดที่แสดงก่อนกด "ดูเพิ่ม" */
const RECENT_FIRST = 10

/**
 * หน้าดูสมาชิกของผู้ดูแล: ใครสมัครไว้บ้าง กำลังเล่นอยู่ไหม เล่นอะไรไปกี่ครั้ง แพ้ชนะเสมอ ใช้เวลาเท่าไหร่ และเล่นกับใคร
 * หน้านี้อ่านอย่างเดียว ข้อมูลมาจากเกมที่จบแล้วซึ่งเซิร์ฟเวอร์บันทึกไว้ทุกเกม และสถานะปัจจุบันของห้อง
 */
export function MembersPage({ navigate }: Props) {
  return (
    <AdminGate navigate={navigate} title="สมาชิก">
      <MembersView navigate={navigate} />
    </AdminGate>
  )
}

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; list: Member[]; at: number }

function gameLabel(id: string): string {
  return isGameId(id) ? gameName(id) : id
}

function MembersView({ navigate }: Props) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [stale, setStale] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<MemberFilter>('all')
  const [sort, setSort] = useState<MemberSort>('joined')
  const [openId, setOpenId] = useState('')

  const reload = useCallback(() => {
    return fetchMembers()
      .then((list) => {
        setLoad({ state: 'ready', list, at: Date.now() })
        setStale(false)
      })
      .catch(() => {
        // โหลดซ้ำไม่สำเร็จ: เก็บรายการเดิมไว้ และบอกว่าข้อมูลอาจไม่ล่าสุด
        setLoad((prev) => (prev.state === 'ready' ? prev : { state: 'failed' }))
        setStale(true)
      })
  }, [])

  useEffect(() => {
    void reload()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void reload()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [reload])

  const list = load.state === 'ready' ? load.list : null
  const shown = useMemo(() => (list ? sortMembers(filterMembers(list, query, filter), sort) : []), [list, query, filter, sort])

  /** เปิดแถวของสมาชิกอีกคน (เช่น กดชื่อคู่แข่ง) ล้างตัวกรองก่อนเพื่อให้แถวนั้นอยู่ในรายการแน่นอน */
  const jumpTo = useCallback((id: string) => {
    setQuery('')
    setFilter('all')
    setOpenId(id)
  }, [])

  if (load.state === 'loading') {
    return (
      <main className="screen">
        <p className="card center" role="status">
          กำลังโหลดรายชื่อสมาชิก…
        </p>
      </main>
    )
  }
  if (load.state === 'failed') {
    return (
      <main className="screen">
        <h1 className="title">สมาชิก</h1>
        <section className="card">
          <p className="error" role="alert">
            โหลดรายชื่อสมาชิกไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่
          </p>
          <div className="row wrap">
            <button type="button" className="btn butter" onClick={() => void reload()}>
              ลองใหม่
            </button>
            <button type="button" className="btn" onClick={() => navigate(ADMIN_PATH)}>
              กลับหน้าจัดการ
            </button>
          </div>
        </section>
      </main>
    )
  }

  const sum = summarize(load.list)
  const known = new Set(load.list.map((m) => m.id))

  return (
    <main className="screen wide members-page" style={{ gap: 16 }}>
      <div className="row wrap admin-head">
        <h1 className="title grow">สมาชิก</h1>
        <button type="button" className="btn mini" onClick={() => navigate(ADMIN_PATH)}>
          กลับหน้าจัดการ
        </button>
        <button type="button" className="btn mini" onClick={() => void reload()}>
          โหลดใหม่
        </button>
      </div>

      <dl className="member-tiles">
        <Tile label="สมาชิกทั้งหมด" value={sum.total} />
        <Tile label="กำลังเล่นอยู่" value={sum.playing} live={sum.playing > 0} />
        <Tile label="รออยู่ในห้องรอ" value={sum.waiting} />
        <Tile label="เคยเล่นจนจบเกม" value={sum.played} />
      </dl>

      <section className="card member-tools" aria-label="ค้นหาและเรียง">
        <label className="member-search">
          <span className="tiny">ค้นหา</span>
          <input
            className="input"
            type="search"
            value={query}
            placeholder="ชื่อหรืออีเมล"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="member-sort">
          <span className="tiny">เรียงตาม</span>
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value as MemberSort)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="row wrap member-filters" role="group" aria-label="กลุ่มสมาชิก">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="chip member-chip"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <p className="small member-count" role="status">
        แสดง {shown.length} จาก {sum.total} คน · อัปเดตเมื่อ {new Date(load.at).toLocaleTimeString('th-TH')}
        {stale && <span className="error"> · โหลดล่าสุดไม่สำเร็จ ข้อมูลอาจไม่ใช่ปัจจุบัน</span>}
      </p>

      {shown.length === 0 ? (
        <p className="card center">{sum.total === 0 ? 'ยังไม่มีใครสมัครสมาชิก' : 'ไม่พบสมาชิกที่ตรงกับเงื่อนไข'}</p>
      ) : (
        <div className="member-list">
          <div className="member-cols" aria-hidden="true">
            <span>สมาชิก</span>
            <span>ตอนนี้</span>
            <span className="mnum">เกม</span>
            <span>ผล</span>
            <span className="mnum">เวลาเล่น</span>
            <span className="mnum">เล่นล่าสุด</span>
          </div>
          {shown.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              now={load.at}
              open={openId === m.id}
              onToggle={() => setOpenId(openId === m.id ? '' : m.id)}
              canJump={(id) => known.has(id)}
              onJump={jumpTo}
            />
          ))}
        </div>
      )}

      <p className="tiny member-foot pretty">
        สถิตินับจากเกมที่เล่นจนจบเท่านั้น (รวมยอมแพ้ หมดเวลา และหลุดจากเกม) ผู้เล่นรับเชิญไม่มีบัญชี จึงไม่อยู่ในรายการนี้
        และแสดงรวมกันเป็น “{GUEST_NAME}” เมื่อเป็นคู่แข่ง
      </p>
    </main>
  )
}

function Tile({ label, value, live }: { label: string; value: number; live?: boolean }) {
  return (
    <div className={`member-tile${live ? ' live' : ''}`}>
      <dt>{label}</dt>
      <dd>{value.toLocaleString('th-TH')}</dd>
    </div>
  )
}

/** ป้ายสถานะตอนนี้: กำลังเล่น รอในห้อง หรือไม่ได้อยู่ในห้อง */
function LivePill({ live }: { live?: Live }) {
  if (!live) return <span className="member-live is-off">ไม่ได้เล่น</span>
  const playing = live.status === 'playing'
  return (
    <span className={`member-live ${playing ? 'is-playing' : 'is-waiting'}${live.connected ? '' : ' is-away'}`}>
      <span className="member-live-dot" aria-hidden="true" />
      {playing ? 'กำลังเล่น' : 'รอในห้อง'} · {gameLabel(live.game)}
      {!live.connected && ' (หลุดอยู่)'}
    </span>
  )
}

function liveOpponent(live: Live): string {
  if (live.opponentGuest) return GUEST_NAME
  return live.opponent ?? ''
}

function WinLoss({ s }: { s: Stats }) {
  return (
    <span className="member-record" aria-label={`ชนะ ${s.wins} แพ้ ${s.losses} เสมอ ${s.draws}`}>
      <span className="win">
        <i>ชนะ</i> {s.wins}
      </span>
      <span className="loss">
        <i>แพ้</i> {s.losses}
      </span>
      <span className="draw">
        <i>เสมอ</i> {s.draws}
      </span>
    </span>
  )
}

interface RowProps {
  member: Member
  now: number
  open: boolean
  onToggle: () => void
  canJump: (id: string) => boolean
  onJump: (id: string) => void
}

function MemberRow({ member: m, now, open, onToggle, canJump, onJump }: RowProps) {
  const ref = useRef<HTMLElement>(null)
  // แถวที่ถูกเปิดจากที่อื่น (กดชื่อคู่แข่ง) เลื่อนมาให้เห็น
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [open])

  const rate = winRate(m)
  return (
    <article ref={ref} className={`member-row${open ? ' open' : ''}`} id={`member-${m.id}`}>
      <button type="button" className="member-head" aria-expanded={open} aria-controls={`member-body-${m.id}`} onClick={onToggle}>
        <span className="member-who">
          <Avatar avatar={m.avatar} size={40} />
          <span className="member-names">
            {/* คนที่ยังไม่ได้ตั้งชื่อ: อีเมลเป็นสิ่งเดียวที่บอกได้ว่าเป็นใคร จึงขึ้นเป็นบรรทัดหลัก */}
            <b>{m.name || m.email}</b>
            <span className="tiny">{m.name ? m.email : 'ยังไม่ได้ตั้งชื่อ'}</span>
          </span>
        </span>
        <span className="member-now">
          <LivePill live={m.live} />
          {m.live && liveOpponent(m.live) && <span className="tiny">กับ {liveOpponent(m.live)}</span>}
        </span>
        <span className="member-cell mnum" data-label="เกม">
          {m.games.toLocaleString('th-TH')}
        </span>
        <span className="member-cell" data-label="ผล">
          {m.games > 0 ? (
            <>
              <WinLoss s={m} />
              {rate !== null && <span className="tiny member-rate">ชนะ {rate}%</span>}
            </>
          ) : (
            <span className="tiny member-none">ยังไม่เคยเล่น</span>
          )}
        </span>
        <span className="member-cell mnum" data-label="เวลาเล่น">
          {formatDuration(m.seconds)}
        </span>
        <span className="member-cell mnum" data-label="เล่นล่าสุด">
          {timeAgo(m.lastPlayedAt, now)}
        </span>
      </button>
      {open && (
        <div className="member-body" id={`member-body-${m.id}`}>
          <MemberBody member={m} canJump={canJump} onJump={onJump} />
        </div>
      )}
    </article>
  )
}

type DetailLoad = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; detail: MemberDetail }

function MemberBody({ member: m, canJump, onJump }: Pick<RowProps, 'member' | 'canJump' | 'onJump'>) {
  const [load, setLoad] = useState<DetailLoad>({ state: 'loading' })
  const [all, setAll] = useState(false)
  // โหลดใหม่เมื่อจำนวนเกมเปลี่ยน (สมาชิกเพิ่งเล่นจบอีกเกมระหว่างที่เปิดแถวนี้อยู่)
  const games = m.games
  useEffect(() => {
    let alive = true
    fetchMember(m.id)
      .then((detail) => alive && setLoad({ state: 'ready', detail }))
      .catch(() => alive && setLoad((prev) => (prev.state === 'ready' ? prev : { state: 'failed' })))
    return () => {
      alive = false
    }
  }, [m.id, games])

  /** ชื่อคู่แข่ง กดเพื่อไปดูสมาชิกคนนั้นได้ถ้ามีบัญชี */
  const who = (p: { id?: string; name?: string; email?: string }) => {
    const label = personLabel(p)
    if (!p.id || !canJump(p.id)) return label
    const id = p.id
    return (
      <button type="button" className="link" onClick={() => onJump(id)}>
        {label}
      </button>
    )
  }

  return (
    <>
      <dl className="member-facts">
        <div>
          <dt>สมัครเมื่อ</dt>
          <dd>{formatDate(m.joinedAt, true)}</dd>
        </div>
        <div>
          <dt>เข้าสู่ระบบล่าสุด</dt>
          <dd>{formatDate(m.lastSignInAt, true)}</dd>
        </div>
        <div>
          <dt>เกมล่าสุดจบเมื่อ</dt>
          <dd>{formatDate(m.lastPlayedAt, true)}</dd>
        </div>
        {m.live && (
          <div>
            <dt>ตอนนี้</dt>
            <dd>
              {m.live.status === 'playing' ? 'กำลังเล่น' : 'รอในห้อง'} {gameLabel(m.live.game)}
              {liveOpponent(m.live) && ` กับ ${liveOpponent(m.live)}`} ·{' '}
              <a href={roomPath(m.live.room)} target="_blank" rel="noopener">
                เปิดดูห้อง {formatRoomCode(m.live.room)}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {load.state === 'loading' && (
        <p className="small" role="status">
          กำลังโหลดประวัติการเล่น…
        </p>
      )}
      {load.state === 'failed' && (
        <p className="error small" role="alert">
          โหลดประวัติการเล่นไม่สำเร็จ ปิดแล้วเปิดแถวนี้ใหม่เพื่อลองอีกครั้ง
        </p>
      )}
      {load.state === 'ready' && load.detail.games === 0 && <p className="small">สมาชิกคนนี้ยังไม่เคยเล่นจนจบเกม</p>}
      {load.state === 'ready' && load.detail.games > 0 && (
        <>
          <h3 className="member-sub">เล่นอะไรไปบ้าง</h3>
          <div className="member-table-wrap">
            <table className="member-table">
              <thead>
                <tr>
                  <th scope="col">เกม</th>
                  <th scope="col" className="mnum">
                    เล่น
                  </th>
                  <th scope="col" className="mnum">
                    ชนะ
                  </th>
                  <th scope="col" className="mnum">
                    แพ้
                  </th>
                  <th scope="col" className="mnum">
                    เสมอ
                  </th>
                  <th scope="col" className="mnum">
                    เวลาเล่น
                  </th>
                  <th scope="col" className="mnum">
                    ล่าสุด
                  </th>
                </tr>
              </thead>
              <tbody>
                {load.detail.byGame.map((g) => (
                  <tr key={g.game}>
                    <th scope="row">{gameLabel(g.game)}</th>
                    <td className="mnum">{g.games}</td>
                    <td className="mnum">{g.wins}</td>
                    <td className="mnum">{g.losses}</td>
                    <td className="mnum">{g.draws}</td>
                    <td className="mnum">{formatDuration(g.seconds)}</td>
                    <td className="mnum">{formatDate(g.lastPlayedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="member-sub">เล่นกับใคร</h3>
          <div className="member-table-wrap">
            <table className="member-table">
              <thead>
                <tr>
                  <th scope="col">คู่แข่ง</th>
                  <th scope="col" className="mnum">
                    เจอกัน
                  </th>
                  <th scope="col" className="mnum">
                    ชนะ
                  </th>
                  <th scope="col" className="mnum">
                    แพ้
                  </th>
                  <th scope="col" className="mnum">
                    เสมอ
                  </th>
                  <th scope="col" className="mnum">
                    เวลาเล่น
                  </th>
                  <th scope="col" className="mnum">
                    ล่าสุด
                  </th>
                </tr>
              </thead>
              <tbody>
                {load.detail.opponents.map((o) => (
                  <tr key={o.id ?? 'guest'}>
                    <th scope="row">
                      <span className="member-opp">
                        <Avatar avatar={o.avatar} size={26} />
                        <span>
                          {who(o)}
                          {o.name && o.email && <span className="tiny member-opp-mail"> {o.email}</span>}
                        </span>
                      </span>
                    </th>
                    <td className="mnum">{o.games}</td>
                    <td className="mnum">{o.wins}</td>
                    <td className="mnum">{o.losses}</td>
                    <td className="mnum">{o.draws}</td>
                    <td className="mnum">{formatDuration(o.seconds)}</td>
                    <td className="mnum">{formatDate(o.lastPlayedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="member-sub">เกมล่าสุด</h3>
          <div className="member-table-wrap">
            <table className="member-table">
              <thead>
                <tr>
                  <th scope="col">เริ่มเมื่อ</th>
                  <th scope="col">เกม</th>
                  <th scope="col">คู่แข่ง</th>
                  <th scope="col">ฝั่ง</th>
                  <th scope="col">ผล</th>
                  <th scope="col" className="mnum">
                    ใช้เวลา
                  </th>
                </tr>
              </thead>
              <tbody>
                {(all ? load.detail.recent : load.detail.recent.slice(0, RECENT_FIRST)).map((g, i) => (
                  <tr key={`${g.startedAt}-${i}`}>
                    <td>{formatDate(g.startedAt, true)}</td>
                    <td>
                      {gameLabel(g.game)}
                      <span className="tiny member-tc"> {describeTimeControl(g.tc)}</span>
                    </td>
                    <td>{who({ id: g.opponentId, name: g.opponentName, email: g.opponentEmail })}</td>
                    <td>{colorName(g.color)}</td>
                    <td>
                      <span className={`member-outcome ${g.outcome}`}>{OUTCOME_TEXT[g.outcome] ?? g.outcome}</span>
                      <span className="tiny"> {reasonLabel(g.reason, g.game)}</span>
                    </td>
                    <td className="mnum">{formatDuration(g.seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!all && load.detail.recent.length > RECENT_FIRST && (
            <button type="button" className="btn mini" onClick={() => setAll(true)}>
              ดูเพิ่ม (อีก {load.detail.recent.length - RECENT_FIRST} เกม)
            </button>
          )}
          {load.detail.games > load.detail.recent.length && (
            <p className="tiny">แสดง {load.detail.recent.length} เกมล่าสุด จากทั้งหมด {load.detail.games} เกม</p>
          )}
        </>
      )}
    </>
  )
}

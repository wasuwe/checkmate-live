import { useIsAdmin } from '../lib/admin'
import { useState, type ClipboardEvent, type FormEvent } from 'react'
import { AccountPanel } from '../components/AccountPanel'
import { Emblem } from '../components/Emblem'
import { HomeFloaters } from '../components/HomeFloaters'
import { StageScene } from '../components/StageScene'
import { roomExists } from '../lib/api'
import { extractRoomId, isRoomId, ROOM_ID_LENGTH } from '../lib/protocol'
import { roomPath, ADMIN_PATH, PIECE_STUDIO_PATH } from '../lib/router'

interface Props {
  navigate: (to: string) => void
}

const CODE_LENGTH = ROOM_ID_LENGTH

/**
 * เหลือเฉพาะตัวอักษรภาษาอังกฤษและตัวเลข ตัวเล็กถูกแปลงเป็นตัวใหญ่
 * ตัวที่ไม่มีในรหัส (0 O 1 I L) ยังพิมพ์ได้ให้เห็น แต่รหัสจะไม่ผ่านและปุ่มเข้าห้องกดไม่ได้
 * ช่องกรอกไม่ตั้ง maxLength เพราะรหัสที่คัดลอกมาอาจมีช่องว่างคั่น (เช่น "K7Q 2XM") ซึ่งจะถูกตัดท้ายก่อนถึงตรงนี้
 */
function cleanCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)
}

export function HomePage({ navigate }: Props) {
  const isAdmin = useIsAdmin()
  const [joinOpen, setJoinOpen] = useState(false)
  const [code, setCode] = useState('')
  const ready = isRoomId(code)
  const [checking, setChecking] = useState(false)
  // ข้อความแจ้งเมื่อรหัสที่กรอกไม่มีห้อง แสดงที่หน้านี้เลย ไม่พาไปหน้าอื่น (เจ้าของโปรเจกต์กำหนด)
  const [joinError, setJoinError] = useState<string | null>(null)

  function changeCode(next: string) {
    setCode(next)
    setJoinError(null)
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault()
    if (!ready || checking) return
    setChecking(true)
    const found = await roomExists(code)
    setChecking(false)
    if (found === 'no') setJoinError('ไม่พบห้องรหัสนี้ ห้องอาจปิดไปแล้ว หรือรหัสไม่ถูกต้อง')
    else if (found === 'limited') setJoinError('ลองถี่เกินไป รอสักครู่แล้วลองใหม่')
    // ตรวจไม่ได้ (เช่น เน็ตสะดุด): พาเข้าห้องตามเดิม หน้าห้องจะแจ้งเองถ้าเข้าไม่ได้
    else navigate(roomPath(code))
  }

  // วางทั้งลิงก์ก็ได้ ระบบดึงรหัสห้องออกมาให้
  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const roomId = extractRoomId(e.clipboardData.getData('text'))
    if (roomId !== null) {
      e.preventDefault()
      changeCode(roomId)
    }
  }

  return (
    <main className="screen home">
      {/* ฉากเวทีกลางคืน: จอกว้างอยู่ครึ่งซ้ายของหน้า จอแคบเป็นแถบด้านบน */}
      <StageScene className="home-scene">
        {/* ตัวหมากจากชุดนิทานลอยอยู่ในฉาก */}
        <HomeFloaters />
      </StageScene>
      <div className="hero">
        <Emblem />
        <h1 className="hero-name">
          CheckMate <em>Live</em>
        </h1>
        <p className="center pretty">เล่นหมากรุก หมากฮอส และหมากหนีบกับเพื่อนผ่านลิงก์ ไม่ต้องสมัครสมาชิก</p>
      </div>

      <div className="menu">
        <button type="button" className="btn big pink block" onClick={() => navigate('/play')}>
          ▶ เล่นเลย
        </button>

        {joinOpen ? (
          <form className="join-panel anim-pop" onSubmit={onJoin}>
            <div className="row">
              <div className="card-title grow">ใส่รหัสห้อง หรือวางลิงก์</div>
              <button
                type="button"
                className="close"
                aria-label="ปิด"
                onClick={() => {
                  setJoinOpen(false)
                  changeCode('')
                }}
              >
                ✕
              </button>
            </div>
            <div className="code-boxes">
              {Array.from({ length: CODE_LENGTH }, (_, i) => (
                <div
                  key={i}
                  className={`code-box${code[i] ? ' filled' : ''}${i === code.length ? ' cursor' : ''}`}
                  aria-hidden="true"
                >
                  <span>{code[i] ?? ''}</span>
                </div>
              ))}
              <input
                value={code}
                onChange={(e) => changeCode(cleanCode(e.target.value))}
                aria-invalid={joinError !== null}
                onPaste={onPaste}
                autoFocus
                autoComplete="off"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                aria-label="รหัสห้อง 6 ตัว (ตัวอักษรและตัวเลข)"
              />
            </div>
            {joinError && (
              <p className="error anim-shake" role="alert">
                {joinError}
              </p>
            )}
            <button type="submit" className={`btn strong${ready ? ' pink' : ''}`} disabled={!ready || checking}>
              {checking ? 'กำลังตรวจรหัส…' : 'เข้าห้อง'}
            </button>
          </form>
        ) : (
          <button type="button" className="btn mint block" onClick={() => setJoinOpen(true)}>
            เข้าห้องด้วยรหัส
          </button>
        )}

        <button type="button" className="btn lavender block" onClick={() => navigate('/profile')}>
          โปรไฟล์ &amp; ชุดหมากรุก
        </button>

        <AccountPanel navigate={navigate} />
      </div>

      <nav className="footer-links">
        <button type="button" className="link" onClick={() => navigate('/rules')}>
          กฎการเล่น
        </button>
        <button type="button" className="link" onClick={() => navigate('/terms')}>
          ข้อตกลงการใช้งาน
        </button>
        <button type="button" className="link" onClick={() => navigate('/gallery')}>
          แกลเลอรี
        </button>
        <button type="button" className="link" onClick={() => navigate('/credits')}>
          เครดิต
        </button>
        {/* แสดงเฉพาะกับผู้ดูแล (เซิร์ฟเวอร์ตรวจสิทธิ์จริงอีกครั้งในหน้านั้น) */}
        {isAdmin && (
          <button type="button" className="link" onClick={() => navigate(ADMIN_PATH)}>
            จัดการข้อมูล
          </button>
        )}
        {isAdmin && (
          <button type="button" className="link" onClick={() => navigate(PIECE_STUDIO_PATH)}>
            จัดการรูปแบบหมาก
          </button>
        )}
      </nav>
    </main>
  )
}

import { myName, useMe } from '../lib/me'
import { loginAvailable, signOut } from '../lib/session'
import { Avatar } from './Avatar'

interface Props {
  navigate: (to: string) => void
}

/** ส่วนบัญชีในหน้าแรก: ปุ่มเข้าสู่ระบบ/สมัคร หรือการ์ดต้อนรับเมื่อ login แล้ว ไม่แสดงถ้าไม่ได้ตั้งค่า Supabase */
export function AccountPanel({ navigate }: Props) {
  const me = useMe()
  if (!loginAvailable || me.loading) return null

  if (me.email === null) {
    return (
      <div className="two">
        <button type="button" className="btn" onClick={() => navigate('/login')}>
          เข้าสู่ระบบ
        </button>
        <button type="button" className="btn butter" onClick={() => navigate('/register')}>
          สมัครสมาชิก
        </button>
      </div>
    )
  }

  return (
    <div className="card plain welcome" style={{ flexDirection: 'row' }}>
      <Avatar avatar={me.profile.avatar} size={44} />
      <div className="grow">
        <div className="tiny">ยินดีต้อนรับ</div>
        <div className="card-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {myName(me)}
        </div>
      </div>
      <button type="button" className="btn mini" onClick={() => void signOut()}>
        ออกจากระบบ
      </button>
    </div>
  )
}

import { APP_NAME } from '../lib/appInfo'
import { myName, useMe } from '../lib/me'
import { VS } from '../lib/pieceSets'
import { goBack } from '../lib/router'
import { Avatar } from './Avatar'

interface Props {
  navigate: (to: string) => void
}

/** แถบบนของทุกหน้ายกเว้นหน้าแรก: ย้อนกลับ ชื่อแอป และทางเข้าโปรไฟล์ */
export function TopBar({ navigate }: Props) {
  const me = useMe()
  return (
    <header className="topbar">
      <button type="button" className="btn icon" aria-label="ย้อนกลับ" onClick={() => goBack(navigate)}>
        ←
      </button>
      <button type="button" className="brand" onClick={() => navigate('/')}>
        <span className="glyph" aria-hidden="true">
          {'♞' + VS}
        </span>
        <span className="brand-name">{APP_NAME}</span>
      </button>
      <div className="grow" />
      <button type="button" className="me-chip" onClick={() => navigate('/profile')}>
        <Avatar avatar={me.profile.avatar} size={32} />
        <span className="name">{myName(me)}</span>
      </button>
    </header>
  )
}

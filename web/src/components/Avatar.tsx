import { avatarUrl } from '../lib/profile'
import { VS } from '../lib/pieceSets'

interface Props {
  /** รหัสรูป ถ้าว่างจะแสดงรูปหมากแทน */
  avatar?: string
  size?: number
  className?: string
}

/** รูปโปรไฟล์ทรงกลม เป็นของประดับ ชื่อผู้เล่นแสดงเป็นข้อความอยู่ข้าง ๆ เสมอ */
export function Avatar({ avatar, size = 36, className = '' }: Props) {
  const style = { width: size, height: size, fontSize: size * 0.6 }
  if (avatar) {
    return (
      <img className={`avatar ${className}`} src={avatarUrl(avatar)} alt="" style={style} draggable={false} />
    )
  }
  return (
    <span className={`avatar avatar-empty ${className}`} style={style} aria-hidden="true">
      {'♞' + VS}
    </span>
  )
}

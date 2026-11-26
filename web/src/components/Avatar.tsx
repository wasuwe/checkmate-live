import { avatarUrl } from '../lib/profile'

interface Props {
  /** รหัสรูป ถ้าว่างจะแสดงตัวอักษรแรกของชื่อแทน */
  avatar?: string
  name: string
  size?: number
}

/** รูปโปรไฟล์ทรงกลม เป็นของประดับ ชื่อผู้เล่นแสดงเป็นข้อความอยู่ข้าง ๆ เสมอ */
export function Avatar({ avatar, name, size = 32 }: Props) {
  const style = { width: size, height: size, fontSize: size * 0.45 }
  if (avatar) {
    return <img className="avatar" src={avatarUrl(avatar)} alt="" style={style} draggable={false} />
  }
  return (
    <span className="avatar avatar-empty" style={style} aria-hidden="true">
      {[...name][0]?.toUpperCase() ?? '?'}
    </span>
  )
}

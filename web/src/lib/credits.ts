// ข้อมูลหน้าเครดิต: ทีมงาน และตัวละคร OC
//
// !! ข้อมูลทั้งหมดในไฟล์นี้ยังเป็นข้อมูลตัวอย่างจากไฟล์ต้นแบบ (ชื่อ ลิงก์ และคำอธิบาย) !!
// แก้ที่ไฟล์นี้ไฟล์เดียวเพื่อใส่ข้อมูลจริง:
//   - link ว่าง ('') = แสดงชื่อเฉย ๆ ไม่เป็นลิงก์
//   - image ของ OC: วางไฟล์รูปไว้ที่ web/public/credits/ แล้วใส่ที่อยู่ เช่น '/credits/kaimuk.webp'
//     (รูปพื้นหลังโปร่ง แนวตั้ง จะสวยที่สุด) ถ้าไม่ใส่จะแสดงอักษรตัวแรกแทน

export interface Person {
  name: string
  /** ชื่อบัญชีที่แสดงใต้ชื่อ เช่น '@nok.dev' */
  handle: string
  /** ลิงก์ที่เปิดเมื่อกด ว่าง = ไม่เป็นลิงก์ */
  link: string
  bg: string
}

export interface TeamGroup {
  role: string
  bg: string
  ids: string[]
}

export interface Oc {
  id: string
  name: string
  title: string
  /** id ของเจ้าของและผู้วาดใน PEOPLE */
  owner: string
  artist: string
  /** สีประจำตัวละคร และสีอ่อนของพื้นหลัง */
  color: string
  pale: string
  bio: string
  /** ที่อยู่รูปตัวละคร (ไม่บังคับ) */
  image?: string
}

export const PEOPLE: Record<string, Person> = {
  nok: { name: 'Nok', handle: '@nok.dev', link: '', bg: '#FFB8CC' },
  mew: { name: 'Mew', handle: '@mewdraws', link: '', bg: '#9FE3C9' },
  pim: { name: 'Pim', handle: '@pim.art', link: '', bg: '#C9BDFF' },
  tae: { name: 'Tae', handle: '@taecodes', link: '', bg: '#FFDC85' },
}

export const TEAM: TeamGroup[] = [
  { role: 'Developer', bg: '#A9D6F7', ids: ['nok', 'tae'] },
  { role: 'Artist', bg: '#FFB8CC', ids: ['mew', 'pim'] },
]

export const OCS: Oc[] = [
  { id: 'kaimuk', name: 'ไข่มุก', title: 'ราชินีขนมหวาน', owner: 'mew', artist: 'mew', color: '#FF8FB1', pale: '#FFE8EF', bio: 'ราชินีผู้ชอบกินขนมระหว่างเดินหมาก ถ้าแพ้จะงอนไปสามวัน' },
  { id: 'phueng', name: 'ผึ้ง', title: 'อัศวินน้ำผึ้ง', owner: 'mew', artist: 'pim', color: '#FFD36E', pale: '#FFF7DA', bio: 'อัศวินขี่ม้าตัวจิ๋ว เดินเป็นรูปตัว L ไปทุกที่ แม้แต่ในชีวิตจริง' },
  { id: 'mintra', name: 'มินตรา', title: 'บิชอปมิ้นต์', owner: 'nok', artist: 'pim', color: '#86D9B9', pale: '#E8FAF2', bio: 'เดินทแยงอย่างเดียวและภูมิใจกับมันมาก ชอบดื่มชามิ้นต์' },
  { id: 'kong', name: 'ก้อง', title: 'ป้อมปราการ', owner: 'nok', artist: 'mew', color: '#B9AAF5', pale: '#F1EDFF', bio: 'ตัวใหญ่ใจดี ยืนเฝ้ามุมกระดานจนกว่าจะถึงตาเข้าป้อม' },
  { id: 'fah', name: 'ฟ้า', title: 'เบี้ยผู้ฝันไกล', owner: 'tae', artist: 'pim', color: '#8CC7F2', pale: '#E6F4FF', bio: 'เบี้ยธรรมดาที่ฝันจะเดินถึงแถวสุดท้ายแล้วกลายเป็นควีน' },
  { id: 'koko', name: 'โกโก้', title: 'ขุนผู้ง่วงนอน', owner: 'pim', artist: 'pim', color: '#C69B72', pale: '#F7E9D7', bio: 'ขุนที่ขยับทีละช่องเพราะยังไม่ตื่นดี แต่ไม่เคยโดนรุกจนสักครั้ง' },
]

/** เลขลำดับของตัวละครตามลำดับในรายการทั้งหมด เช่น "01" (ไม่เปลี่ยนตามตัวกรอง) */
export function ocNumber(oc: Oc): string {
  return String(OCS.indexOf(oc) + 1).padStart(2, '0')
}

/** ตัวกรองเจ้าของ: "ทั้งหมด" ตามด้วยคนที่มี OC อย่างน้อยหนึ่งตัว */
export function ownerFilters(): { id: string; label: string }[] {
  const owners = Object.keys(PEOPLE).filter((id) => OCS.some((o) => o.owner === id))
  return [{ id: 'all', label: 'ทั้งหมด' }, ...owners.map((id) => ({ id, label: PEOPLE[id].name }))]
}

export function ocsOf(filter: string): Oc[] {
  return filter === 'all' ? OCS : OCS.filter((o) => o.owner === filter)
}

/**
 * ตัวละครที่ควรถูกเลือกหลังเปลี่ยนตัวกรอง: ตัวเดิมถ้ายังอยู่ในรายการ ไม่งั้นตัวแรกของรายการใหม่
 */
export function selectionFor(filter: string, currentId: string): string {
  const list = ocsOf(filter)
  return list.some((o) => o.id === currentId) ? currentId : (list[0]?.id ?? OCS[0].id)
}

/**
 * ตำแหน่งถัดไปเมื่อกดปุ่มลูกศรในตารางเลือกตัว (`columns` คือจำนวนคอลัมน์ที่แสดงอยู่)
 * คืนตำแหน่งเดิมถ้าไปต่อไม่ได้ หรือไม่ใช่ปุ่มลูกศร
 */
export function moveIndex(key: string, index: number, count: number, columns: number): number {
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[key]
  if (step === undefined) return index
  const next = index + step
  return next >= 0 && next < count ? next : index
}

/** ลิงก์ที่เปิดได้อย่างปลอดภัย: เฉพาะ http(s) ไม่งั้นถือว่าไม่มีลิงก์ */
export function safeLink(link: string): string | null {
  return /^https?:\/\//i.test(link) ? link : null
}

/**
 * อักษรที่ใช้แทนรูปเมื่อยังไม่มีรูป: ตัวแรกของชื่อ แต่ข้ามสระนำหน้าของภาษาไทย (เ แ โ ใ ไ)
 * เพื่อให้ "ไข่มุก" ได้ "ข" ไม่ใช่ "ไ"
 */
export function initialOf(name: string): string {
  const chars = [...name.trim()]
  return (chars.length > 1 && 'เแโใไ'.includes(chars[0]) ? chars[1] : chars[0]) ?? ''
}

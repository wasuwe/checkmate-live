// คณิตศาสตร์ของการครอปรูป: รูปถูกเลื่อนและซูมอยู่ใต้กรอบที่มีสัดส่วนคงที่ (แบบตัวเลือกรูปโปรไฟล์ทั่วไป)
// แยกจากหน้าจอเพื่อให้ทดสอบได้โดยไม่ต้องมีเบราว์เซอร์

export interface Size {
  width: number
  height: number
}

/** การจัดวางรูปใต้กรอบ: ซูม (1 = รูปพอดีคลุมกรอบ) และจุดกึ่งกลางของกรอบบนรูป (0–1 ของรูป) */
export interface CropView {
  zoom: number
  cx: number
  cy: number
}

export const MIN_ZOOM = 1
export const MAX_ZOOM = 5

export const START_VIEW: CropView = { zoom: 1, cx: 0.5, cy: 0.5 }

/** สัดส่วนที่รูปต้องถูกขยายบนจอเพื่อให้คลุมกรอบพอดีเมื่อซูมเป็น 1 */
export function coverScale(image: Size, frame: Size): number {
  return Math.max(frame.width / image.width, frame.height / image.height)
}

/**
 * ทำให้การจัดวางใช้ได้: ซูมอยู่ในช่วง และกรอบไม่หลุดออกนอกรูป (ไม่มีขอบว่างในกรอบ)
 */
export function clampView(view: CropView, image: Size, frame: Size): CropView {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(view.zoom) ? view.zoom : 1))
  const scale = coverScale(image, frame) * zoom
  // ครึ่งหนึ่งของส่วนที่กรอบมองเห็น เป็นสัดส่วนของรูป
  const halfW = frame.width / scale / image.width / 2
  const halfH = frame.height / scale / image.height / 2
  const clamp = (v: number, half: number) => Math.min(1 - half, Math.max(half, Number.isFinite(v) ? v : 0.5))
  return { zoom, cx: clamp(view.cx, halfW), cy: clamp(view.cy, halfH) }
}

/** ส่วนของรูปต้นฉบับ (พิกเซล) ที่อยู่ในกรอบ */
export function sourceRect(view: CropView, image: Size, frame: Size): { x: number; y: number; width: number; height: number } {
  const v = clampView(view, image, frame)
  const scale = coverScale(image, frame) * v.zoom
  const width = frame.width / scale
  const height = frame.height / scale
  return { x: v.cx * image.width - width / 2, y: v.cy * image.height - height / 2, width, height }
}

/** เลื่อนรูปตามระยะที่ลากบนจอ (พิกเซล): ลากไปทางขวา รูปตามไปทางขวา จุดกึ่งกลางของกรอบบนรูปจึงขยับไปทางซ้าย */
export function panView(view: CropView, dx: number, dy: number, image: Size, frame: Size): CropView {
  const scale = coverScale(image, frame) * view.zoom
  return clampView({ zoom: view.zoom, cx: view.cx - dx / scale / image.width, cy: view.cy - dy / scale / image.height }, image, frame)
}

/** ขนาดผลลัพธ์: เท่าส่วนที่ครอป แต่ด้านยาวไม่เกิน max (ไม่ขยายรูปเล็ก) */
export function outputSize(rect: Size, max: number): Size {
  const scale = Math.min(1, max / Math.max(rect.width, rect.height))
  return { width: Math.max(1, Math.round(rect.width * scale)), height: Math.max(1, Math.round(rect.height * scale)) }
}

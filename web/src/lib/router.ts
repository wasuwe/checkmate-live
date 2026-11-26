// router ขนาดเล็ก: แอปมีไม่กี่หน้า จึงไม่ใช้ไลบรารี

import { useCallback, useSyncExternalStore } from 'react'
import { isRoomId } from './protocol'

export type Route =
  | { page: 'home' }
  | { page: 'play' }
  | { page: 'login' }
  | { page: 'register' }
  | { page: 'terms' }
  | { page: 'rules' }
  | { page: 'profile' }
  | { page: 'credits' }
  | { page: 'gallery' }
  | { page: 'pieces' }
  | { page: 'admin' }
  | { page: 'room'; roomId: string }
  | { page: 'not_found' }

/** ที่อยู่ของหน้าจัดการข้อมูลของผู้ดูแล เปลี่ยนที่นี่ที่เดียว (เจ้าของโปรเจกต์เลือกชื่อนี้แทน /admin) */
export const ADMIN_PATH = '/backstage'
/** หน้าจัดการรูปแบบตัวหมาก (บทบาทแยกจาก admin) */
export const PIECE_STUDIO_PATH = '/piece-studio'

const STATIC: Record<string, Route> = {
  '/': { page: 'home' },
  '/play': { page: 'play' },
  '/login': { page: 'login' },
  '/register': { page: 'register' },
  '/terms': { page: 'terms' },
  '/rules': { page: 'rules' },
  '/profile': { page: 'profile' },
  '/credits': { page: 'credits' },
  '/gallery': { page: 'gallery' },
  [ADMIN_PATH]: { page: 'admin' },
  [PIECE_STUDIO_PATH]: { page: 'pieces' },
}

export function parseRoute(pathname: string): Route {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  if (path === '') return { page: 'home' }
  if (Object.hasOwn(STATIC, path)) return STATIC[path]
  const match = /^\/room\/([^/]+)$/.exec(path)
  if (match && isRoomId(match[1])) return { page: 'room', roomId: match[1] }
  return { page: 'not_found' }
}

export function roomPath(roomId: string): string {
  return `/room/${roomId}`
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}

export function usePathname(): [string, (to: string) => void] {
  const pathname = useSyncExternalStore(subscribe, () => window.location.pathname)
  const navigate = useCallback((to: string) => {
    window.history.pushState({ inApp: true }, '', to)
    window.dispatchEvent(new PopStateEvent('popstate'))
    window.scrollTo(0, 0)
  }, [])
  return [pathname, navigate]
}

/** ย้อนกลับหนึ่งหน้า ถ้าเปิดลิงก์เข้ามาตรง ๆ (ไม่มีหน้าก่อนในแอป) ให้ไปหน้าแรก */
export function goBack(navigate: (to: string) => void): void {
  // หน้าที่มาจากการกดในแอปมี state ที่ navigate ใส่ไว้ หน้าแรกที่เปิดเข้ามาไม่มี
  if ((window.history.state as { inApp?: boolean } | null)?.inApp) window.history.back()
  else navigate('/')
}

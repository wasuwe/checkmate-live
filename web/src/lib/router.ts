// router ขนาดเล็ก: แอปมีแค่หน้าแรกกับหน้าห้อง จึงไม่ใช้ไลบรารี

import { useCallback, useSyncExternalStore } from 'react'
import { isRoomId } from './protocol'

export type Route = { page: 'home' } | { page: 'room'; roomId: string } | { page: 'not_found' }

export function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { page: 'home' }
  const match = /^\/room\/([^/]+)\/?$/.exec(pathname)
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
    window.history.pushState(null, '', to)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [])
  return [pathname, navigate]
}

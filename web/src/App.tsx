import { parseRoute, usePathname } from './lib/router'
import { HomePage } from './pages/HomePage'
import { RoomPage } from './pages/RoomPage'

function App() {
  const [pathname, navigate] = usePathname()
  const route = parseRoute(pathname)

  switch (route.page) {
    case 'home':
      return <HomePage navigate={navigate} />
    case 'room':
      // key ทำให้เปลี่ยนห้องแล้วได้ state ใหม่ทั้งหมด
      return <RoomPage key={route.roomId} roomId={route.roomId} navigate={navigate} />
    case 'not_found':
      return (
        <main className="page">
          <h1>ไม่พบหน้านี้</h1>
          <button type="button" className="primary" onClick={() => navigate('/')}>
            กลับหน้าแรก
          </button>
        </main>
      )
  }
}

export default App

import { TopBar } from './components/TopBar'
import { parseRoute, usePathname } from './lib/router'
import { AdminPage } from './pages/AdminPage'
import { CreditsPage } from './pages/CreditsPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { PlayPage } from './pages/PlayPage'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterPage } from './pages/RegisterPage'
import { RoomPage } from './pages/RoomPage'
import { RulesPage } from './pages/RulesPage'
import { TermsPage } from './pages/TermsPage'

function App() {
  const [pathname, navigate] = usePathname()
  const route = parseRoute(pathname)

  return (
    <div className="app">
      {route.page !== 'home' && <TopBar navigate={navigate} />}
      {page()}
    </div>
  )

  function page() {
    switch (route.page) {
      case 'home':
        return <HomePage navigate={navigate} />
      case 'play':
        return <PlayPage navigate={navigate} />
      case 'login':
        return <LoginPage navigate={navigate} />
      case 'register':
        return <RegisterPage navigate={navigate} />
      case 'terms':
        return <TermsPage navigate={navigate} />
      case 'rules':
        return <RulesPage navigate={navigate} />
      case 'profile':
        return <ProfilePage navigate={navigate} />
      case 'credits':
        return <CreditsPage />
      case 'admin':
        return <AdminPage navigate={navigate} />
      case 'room':
        // key ทำให้เปลี่ยนห้องแล้วได้ state ใหม่ทั้งหมด
        return <RoomPage key={route.roomId} roomId={route.roomId} navigate={navigate} />
      case 'not_found':
        return (
          <main className="screen">
            <h1 className="title">ไม่พบหน้านี้</h1>
            <button type="button" className="btn pink" onClick={() => navigate('/')}>
              กลับหน้าแรก
            </button>
          </main>
        )
    }
  }
}

export default App

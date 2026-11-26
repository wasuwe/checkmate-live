import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// ฟอนต์เสิร์ฟจากเซิร์ฟเวอร์ของเราเอง (ไม่เรียก Google Fonts) จึงไม่ต้องเปิด CSP ให้โดเมนอื่น
import '@fontsource/mitr/thai-500.css'
import '@fontsource/mitr/thai-600.css'
import '@fontsource/mitr/latin-500.css'
import '@fontsource/mitr/latin-600.css'
import '@fontsource/mali/thai-400.css'
import '@fontsource/mali/thai-600.css'
import '@fontsource/mali/thai-700.css'
import '@fontsource/mali/latin-400.css'
import '@fontsource/mali/latin-600.css'
import '@fontsource/mali/latin-700.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

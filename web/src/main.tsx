import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// ฟอนต์เสิร์ฟจากเซิร์ฟเวอร์ของเราเอง (ไม่เรียก Google Fonts) จึงไม่ต้องเปิด CSP ให้โดเมนอื่น
// สไตล์ "ละครเวทีนิทาน": หัวข้อใช้ฟอนต์มีเชิง เนื้อหาใช้ฟอนต์ไม่มีเชิงที่อ่านง่าย
import '@fontsource/noto-serif-thai/thai-600.css'
import '@fontsource/noto-serif-thai/thai-700.css'
import '@fontsource/noto-serif-thai/latin-600.css'
import '@fontsource/noto-serif-thai/latin-700.css'
import '@fontsource/ibm-plex-sans-thai/thai-400.css'
import '@fontsource/ibm-plex-sans-thai/thai-500.css'
import '@fontsource/ibm-plex-sans-thai/thai-600.css'
import '@fontsource/ibm-plex-sans-thai/latin-400.css'
import '@fontsource/ibm-plex-sans-thai/latin-500.css'
import '@fontsource/ibm-plex-sans-thai/latin-600.css'
import '@fontsource/ibm-plex-sans-thai/thai-700.css'
import '@fontsource/ibm-plex-sans-thai/latin-700.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

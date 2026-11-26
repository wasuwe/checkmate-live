import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// โหมด dev: ส่ง /api และ /ws ต่อไปยัง Go server ที่ :8080 (เปลี่ยนได้ด้วย API_TARGET เช่น ตอนรันชุดทดสอบคู่ขนาน)
const apiTarget = process.env.API_TARGET ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': apiTarget,
      '/ws': { target: apiTarget.replace(/^http/, 'ws'), ws: true },
    },
  },
})

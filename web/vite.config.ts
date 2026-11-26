import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// โหมด dev: ส่ง /api และ /ws ต่อไปยัง Go server ที่ :8080
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
})

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4003',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:4003',
        ws: true,
      },
    },
  },
})

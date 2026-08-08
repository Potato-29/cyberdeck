import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Flask serves the built bundle from ideas/web/dist on port 2124, so in dev we
// proxy the API to that same server rather than enabling CORS anywhere.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:2124',
      '/health': 'http://127.0.0.1:2124',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // dist/ is committed so the phone needs no toolchain; a readable diff of
    // hashed asset names is more useful than a sourcemap here.
    sourcemap: false,
  },
})

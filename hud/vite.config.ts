import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// webhook_new.py serves the built bundle at /hud (assets under /hud/assets),
// so in dev every API path is proxied to that same Flask process on 2122.
const API = ['/dashboard', '/restart', '/stop', '/service', '/actions', '/action',
  '/feed', '/door-open', '/door-close', '/feeder-status', '/deck', '/audio']

export default defineConfig({
  base: '/hud/',
  plugins: [react()],
  server: {
    port: 5174,
    proxy: Object.fromEntries(API.map((p) => [p, 'http://127.0.0.1:2122'])),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // dist/ is committed so the phone needs no toolchain, same as ideas/web.
    sourcemap: false,
  },
})

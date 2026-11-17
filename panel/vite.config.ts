import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// webhook_new.py serves the built bundle at /panel and /panel/edit (assets
// under /panel/assets), so in dev every API path is proxied to that same Flask
// process on 2122. /panel itself is proxied except for Vite's own files.
const API = ['/dashboard', '/restart', '/stop', '/status', '/actions', '/action',
  '/feed', '/feeder-status', '/deck', '/audio', '/spotify']
const PANEL_API = ['config', 'catalog', 'push', 'notify', 'goto', 'events', 'key']

export default defineConfig({
  base: '/panel/',
  plugins: [react()],
  server: {
    port: 5175,
    proxy: Object.fromEntries([
      ...API.map((p) => [p, 'http://127.0.0.1:2122']),
      ...PANEL_API.map((p) => [`/panel/${p}`, 'http://127.0.0.1:2122']),
    ]),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // dist/ is committed so the phone needs no toolchain, same as hud/.
    sourcemap: false,
  },
})

import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// Local by default. Start with SHORTLIST_REMOTE=1 (see start.cmd / start.sh "remote") to accept connections
// from other devices (phone over Tailscale/LAN, a tunnel). Remote mode also removes the API token from the
// bundle, so access is controlled only by the ACCESS_PASSCODE login.
const remote = process.env.SHORTLIST_REMOTE === '1'
const version = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:5871'

// The browser only talks to this server; /api is forwarded to the backend, so a phone never needs to reach port 5871.
const proxy = { '/api': { target: apiTarget, xfwd: true } }

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    ...(remote ? { 'import.meta.env.VITE_API_TOKEN': JSON.stringify('') } : {}),
  },
  server: {
    port: 5870,
    strictPort: true,
    proxy,
    ...(remote ? { host: true, allowedHosts: true } : {}),
  },
  preview: {
    port: 5870,
    strictPort: true,
    proxy,
    ...(remote ? { host: true, allowedHosts: true } : {}),
  },
})

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The Playwright run points this at its own server (port 4100, separate database).
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Unit tests only; the Playwright specs in e2e/ run with `pnpm test:e2e`.
  test: { include: ['src/**/*.test.{ts,tsx}'] },
  server: {
    port: 5173,
    // Only with LK_TUNNEL=1: lets a Cloudflare quick tunnel (https://<random>.trycloudflare.com)
    // reach the dev server for testing on a phone (docs/DEV_ENVIRONMENT.md). Off by default so
    // the dev server is not reachable from the internet by accident. Close the tunnel after use.
    allowedHosts: process.env.LK_TUNNEL === '1' ? ['.trycloudflare.com'] : [],
    proxy: {
      // Same origin in dev, so no CORS and the httpOnly refresh cookie just works.
      '/api': apiTarget,
      // Live status and alerts (Socket.IO, WebSocket upgrade).
      '/socket.io': { target: apiTarget, ws: true },
    },
  },
});

/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Avoid colliding with calibre's content-server (often on 5173). When the
    // default port is taken, Vite normally auto-increments; pinning below
    // surfaces a clear "port in use" error instead of silently jumping onto
    // calibre's URL.
    port: 5180,
    strictPort: false,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
  },
});
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { fakeApiServerPlugin } from './src/mock/fakeApi';

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    fakeApiServerPlugin(),
  ],
  worker: {
    plugins: () => [wasm(), topLevelAwait()],
    format: 'es',
  },
  resolve: {
    alias: {
      env: '/src/wasm/env.ts',
    },
  },
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
/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the PHP API runs on 127.0.0.1:8080 (see README) and Vite forwards /api to it,
// so the browser sees a single origin, exactly as it does on the server.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
  // The E2E tests serve the built app with the same single-origin layout as the server.
  preview: {
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // jsdom computes styles slowly once a file has mounted many MUI screens (every distinct `sx` adds rules to the
    // document); the default 5 s left the slowest screens a few hundred ms from failing on a busy runner.
    testTimeout: 15_000,
  },
});

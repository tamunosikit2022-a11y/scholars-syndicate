import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development, "/api/..." is forwarded to the API so no CORS setup is needed.
    proxy: { '/api': 'http://localhost:4000' },
  },
  build: { sourcemap: false, target: 'es2020' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});

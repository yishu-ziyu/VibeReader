import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    testTimeout: 30000,
    exclude: [
      '**/node_modules/**',
      '**/e2e/**',
      '**/dist/**',
    ],
  },
});

// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base: the build works under /schema/ on hlks.org and on any other static host or sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: { outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 2000 },
  server: { port: 5180, strictPort: true },
  preview: { port: 5181, strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
} as never);

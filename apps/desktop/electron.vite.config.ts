import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: {
        // Two entries: the Electron main process and the data worker (which
        // owns the ROS 2 WebSocket connection and all decoding).
        input: {
          index: resolve(projectRoot, 'src/main/index.ts'),
          'data-worker': resolve(projectRoot, 'src/main/data-worker.ts'),
        },
        output: {
          format: 'es',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: resolve(projectRoot, 'src/preload/index.ts') },
        // A sandboxed preload must be CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(projectRoot, 'src/renderer'),
    build: {
      outDir: resolve(projectRoot, 'out/renderer'),
      rollupOptions: { input: resolve(projectRoot, 'src/renderer/index.html') },
    },
    plugins: [react(), tailwindcss()],
  },
});

import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const root = process.cwd()

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(root, 'apps/desktop/src/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(root, 'apps/desktop/src/preload/index.ts'),
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs',
        },
      },
    },
  },
  renderer: {
    root: resolve(root, 'apps/desktop/src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@ai-whiteboard/core': resolve(root, 'packages/core/src/index.ts'),
      },
    },
    build: {
      rollupOptions: {
        input: resolve(root, 'apps/desktop/src/renderer/index.html'),
      },
    },
  },
})

import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@ai-whiteboard/core': resolve(process.cwd(), 'packages/core/src/index.ts'),
    },
  },
  test: {
    passWithNoTests: true,
    include: [
      'apps/**/src/**/*.{test,spec}.{ts,tsx}',
      'packages/**/src/**/*.{test,spec}.{ts,tsx}',
      'packages/**/tests/**/*.{test,spec}.{ts,tsx}',
    ],
  },
})

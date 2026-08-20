import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    passWithNoTests: true,
    include: [
      'apps/**/src/**/*.{test,spec}.{ts,tsx}',
      'packages/**/src/**/*.{test,spec}.{ts,tsx}',
      'packages/**/tests/**/*.{test,spec}.{ts,tsx}',
    ],
  },
})

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/firebase/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
})

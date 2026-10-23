import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['test/unit/client/**', 'jsdom'],
    ],
    include: ['test/**/*.test.js'],
  },
})

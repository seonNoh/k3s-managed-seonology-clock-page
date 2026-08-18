import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{js,jsx}'],
    exclude: [
      'tests/unit/container-smoke.test.js',
      'tests/unit/release-gate.test.js',
    ],
    clearMocks: true,
    restoreMocks: true,
  },
})

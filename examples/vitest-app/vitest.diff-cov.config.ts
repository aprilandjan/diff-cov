import { defineConfig } from 'vitest/config'
import DiffCovReporter from '@diff-cov/vitest'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
    },
    reporters: [
      'default',
      new DiffCovReporter({
        // In a real repository use "auto" (or omit base entirely).
        base: 'HEAD',
        threshold: 90,
        failOnError: false,
      }),
    ],
  },
})

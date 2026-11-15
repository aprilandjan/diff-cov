# @diff-cov/vitest

Vitest 4 reporter for diff coverage.

```bash
pnpm add -D @diff-cov/vitest
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import DiffCovReporter from '@diff-cov/vitest'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['lcov'],
    },
    reporters: ['default', new DiffCovReporter()],
  },
})
```

The reporter reads the in-memory coverage map, not the lcov file. It diffs the
worktree against the base, so committed, staged, unstaged, and untracked changes
all count. This is the development-time view, before a commit exists.

It is report-only by default. To enforce the threshold:

```ts
new DiffCovReporter({ threshold: 90, failOnError: true })
```

Options: `base`, `threshold`, `perFileThreshold`, `failOnError`,
`enabledInWatch`, `config`, `report`.

The in-memory coverage map is the source of truth: changed files that Vitest did
not instrument are skipped. It uses the `auto` base by default.

Requires Vitest 4.

MIT licensed.

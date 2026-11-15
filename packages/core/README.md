# @diff-cov/core

Compute line coverage of the lines a git diff adds or modifies.

This is the library behind `@diff-cov/cli` and `@diff-cov/vitest`. It parses git
diffs, lcov and Cobertura reports, intersects the changed lines with the
instrumented lines, and evaluates thresholds.

```ts
import { collectDiffCoverage, parseLcov } from '@diff-cov/core'
import { readFile } from 'node:fs/promises'

const coverage = parseLcov(await readFile('coverage/lcov.info', 'utf8'), {
  root: process.cwd(),
  projectRoot: process.cwd(),
  reportDir: 'coverage',
})

const report = await collectDiffCoverage({
  cwd: process.cwd(),
  base: 'origin/main',
  scope: 'committed',
  coverage,
})

console.log(report.totals)
```

The metric is defined in the repository's `docs/metric.md`:

- added and modified lines on the head side of the diff are the candidate set;
- lines absent from the coverage report are not executable and are excluded;
- a changed file missing from the report fails closed by default.

MIT licensed.

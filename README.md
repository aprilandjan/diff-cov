# DiffCov

Line coverage for the lines a git diff adds or modifies.

DiffCov reads the coverage report your test runner already produces, intersects it with the lines a change introduces, and fails when those lines fall below a threshold. It is built for the commit and push workflow: a pre-push hook, a Vitest reporter, or a CI step.

> Status: early. Vitest 4 and lcov/Cobertura reports are supported. The metric is specified in [docs/metric.md](docs/metric.md).

## Why not total coverage?

A repository-wide percentage cannot tell you whether the change under review is tested. A large, well-covered codebase barely moves when a new branch is untested. Diff coverage scopes the denominator to the change:

```
changed executable lines covered / changed executable lines measured
```

Only lines added on the head side of the diff count. A modified line is a `-old` / `+new` pair, so its new line is part of the same set. Deleted lines, context lines, comments, type-only declarations, and lines the coverage tool does not instrument are excluded. See [docs/metric.md](docs/metric.md).

## Packages

| Package | Purpose |
| --- | --- |
| `diff-cov-core` | Git diff, coverage parsers, intersection, thresholds. No CLI, no runner dependency. |
| `diff-cov-cli` | `diff-cov` binary for pre-push hooks and CI. |
| `diff-cov-vitest` | Vitest 4 reporter that uses the in-memory coverage map. |

## Quick start: pre-push

Generate a report:

```bash
npx vitest run --coverage
```

Run the check:

```bash
npx diff-cov --base new --threshold 90
```

Add it to Husky:

```bash
# .husky/pre-push
npx diff-cov --push --threshold 90
```

`--push` reads the refs git passes on stdin, so it measures exactly what this push adds to the remote. If there is no stdin, it falls back to `new` mode.

Exit codes:

| Code | Meaning |
| --- | --- |
| `0` | Passed, or no measurable changed lines |
| `1` | Below the threshold |
| `2` | Configuration, usage, or git error |
| `3` | Coverage report missing, unreadable, or older than the changed files |

## Base modes

| Mode | Question | Implementation |
| --- | --- | --- |
| `--base origin/stable` | What did I change relative to this branch? | `merge-base(ref, HEAD) → HEAD` |
| `--base auto` | Same, with the trunk found automatically | Candidates: remote `HEAD`, `main`, `master`, `develop`, `release/*`; the candidate with the closest merge-base wins |
| `--base new` | What does this push add to the remote? | pre-push stdin `remote sha → local sha`; otherwise the closest remote-tracking merge-base |

`branch` and `auto` use three-dot semantics. `new` uses the remote tip, which is what the remote receives.

`auto` always prints the ref it chose. Run `git fetch` if the base ref is missing; DiffCov never fetches from a hook.

## Vitest 4 reporter

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import DiffCovReporter from 'diff-cov-vitest'

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

The reporter reads the in-memory coverage map, not the lcov file. That matters because Vitest has no public hook that runs after coverage files are written, and the map is the only reliable source at that point.

It diffs the **worktree** against the base: committed, staged, unstaged, and untracked files all count. This is the development-time view, before a commit exists.

The reporter is report-only by default. To enforce the threshold:

```ts
new DiffCovReporter({ threshold: 90, failOnError: true })
```

## Configuration

`diff-cov.config.mjs` at the repository root, or `package.json#diffCov`:

```js
export default {
  base: 'auto',
  scope: 'committed',
  coverage: ['coverage/lcov.info'],
  include: ['src/**/*.{ts,tsx}'],
  exclude: ['**/*.{test,spec}.*', '**/__tests__/**', '**/*.d.ts', '**/generated/**'],
  threshold: 90,
  perFile: 0,
  missing: 'fail',
  allowStale: false,
}
```

`missing` controls a changed source file that is absent from the coverage report:

- `fail` (default): exit 3. An untested new file must not pass silently.
- `warn`: skip it and print a warning.
- `ignore`: skip it silently.

With Vitest, set `coverage.include` to the source globs so untested files are emitted with zero hits.

## Report

```text
Diff coverage 87.5% (28/32)  FAIL
Threshold: 90% total
Base: origin/main (merge-base 4f2a1c9, 3 commit(s) behind)
Scope: committed · coverage coverage/lcov.info

src/features/cart/total.ts
  12/14  85.7%  missing 42, 57

src/api/client.ts
  8/8  100.0%

2 file(s) · 32 measured line(s) · 28 covered · 4 uncovered · 3 uninstrumented
```

`--json` prints the same model as JSON. `--report <path>` writes it to a file.

## Limitations

- Vitest 4 only, for now. Jest is not wired up.
- Line coverage only. Branch coverage of changed lines is a separate metric.
- Multi-line statements are attributed to their opening line by the coverage tool. A change that only touches a continuation line may be counted as uninstrumented.
- The coverage report must refer to the same source revision as the diff. The CLI checks report freshness; the reporter always uses the in-memory map.
- Generated bundles and source maps are not resolved. Vitest's built-in providers report source paths, which is what DiffCov expects.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter diff-cov-example-vitest-app test:coverage
node packages/cli/dist/index.js --cwd examples/vitest-app --base auto --threshold 90
```

The example project under `examples/vitest-app` is a small Vitest 4 app with covered, partially covered, and untested files.

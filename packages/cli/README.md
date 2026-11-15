# @diff-cov/cli

Line coverage for the lines a git diff adds or modifies, built for the commit
and push workflow.

```bash
pnpm add -D @diff-cov/cli
pnpm exec diff-cov --base new --threshold 90
```

The package installs a `diff-cov` binary.

## Pre-push

Generate coverage with your test runner, then:

```bash
# .husky/pre-push
pnpm exec diff-cov --push --threshold 90
```

`--push` reads the refs git passes on stdin, so it measures exactly what the
push adds to the remote.

## Direct invocation

```bash
npx @diff-cov/cli --base auto --threshold 90
npx @diff-cov/cli --base origin/main --threshold 90
```

## Exit codes

| Code | Meaning                                                              |
| ---- | -------------------------------------------------------------------- |
| `0`  | Passed, or no measurable changed lines                               |
| `1`  | Below the threshold                                                  |
| `2`  | Configuration, usage, or git error                                   |
| `3`  | Coverage report missing, unreadable, or older than the changed files |

## Base modes

- `--base <ref>`: diff from `merge-base(ref, HEAD)`.
- `--base auto`: find the closest trunk (`main`, `master`, `develop`, `release/*`).
- `--base new`: use the pre-push remote sha, or the closest remote-tracking merge-base.

Reports can be lcov or Cobertura. See the main repository README for the full
configuration and the metric definition.

MIT licensed.

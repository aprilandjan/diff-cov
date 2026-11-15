# @diff-cov/cli

Line coverage for the lines a git diff adds or modifies, built for the commit
and push workflow.

```bash
pnpm add -D @diff-cov/cli
pnpm exec diff-cov
```

The package installs a `diff-cov` binary. With no arguments it reads
`coverage/lcov.info`, uses the `auto` base, and applies a 90% threshold.

## Pre-push

Generate coverage with your test runner, then:

```bash
# .husky/pre-push
pnpm exec diff-cov
```

## Direct invocation

```bash
npx @diff-cov/cli
npx @diff-cov/cli --base stable
npx @diff-cov/cli --base origin/main
npx @diff-cov/cli --base auto --threshold 90
```

## Base modes

- `--base auto` (default): the closest remote-tracking ancestor. This answers
  "what does the remote not have yet".
- `--base stable`: the closest stable trunk (`main`, `master`, `develop`,
  `release/*`). This answers "what did this branch change relative to trunk".
- `--base <ref>`: diff from `merge-base(ref, HEAD)`.

## Exit codes

| Code | Meaning                                                              |
| ---- | -------------------------------------------------------------------- |
| `0`  | Passed, or no measurable changed lines                               |
| `1`  | Below the threshold                                                  |
| `2`  | Configuration, usage, or git error                                   |
| `3`  | Coverage report missing, unreadable, or older than the changed files |

## Coverage report

The report is the source of truth. Only files present in the report are
measured; changed files absent from the report are skipped. Reports can be lcov
or Cobertura.

`--advisory` reports a threshold failure but exits `0`. Use it while rolling
out the gate; keep the blocking check in CI or pre-push.

See the main repository README for configuration and the metric definition.

MIT licensed.

---
'@diff-cov/core': minor
'@diff-cov/cli': minor
'@diff-cov/vitest': minor
---

The coverage report is now the source of truth. Changed files absent from the
report are skipped instead of failing, and `missing`, `include`, and `exclude`
are removed from the public config and CLI. Base modes are now `auto` (default),
`stable`, or an explicit ref; `new` and `--push` are removed.

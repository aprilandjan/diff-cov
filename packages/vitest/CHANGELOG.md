# @diff-cov/vitest

## 0.2.0

### Minor Changes

- f2c4570: The coverage report is now the source of truth. Changed files absent from the
  report are skipped instead of failing, and `missing`, `include`, and `exclude`
  are removed from the public config and CLI. Base modes are now `auto` (default),
  `stable`, or an explicit ref; `new` and `--push` are removed.

### Patch Changes

- Updated dependencies [f2c4570]
  - @diff-cov/core@0.2.0

## 0.1.1

### Patch Changes

- ad8978c: Validate the trusted publishing release workflow.
- Updated dependencies [ad8978c]
  - @diff-cov/core@0.1.1

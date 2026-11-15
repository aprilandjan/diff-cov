# Diff coverage metric

DiffCov measures **line coverage of the lines a change adds or modifies**.

It answers one question: of the executable lines this change introduces, how many did the test suite execute?

## Definition

For each changed file, let:

- `A` be the set of line numbers added on the head side of the diff.
- `C` be the set of line numbers the coverage report marks as executable for that file.
- `M = A ∩ C` be the measured changed lines.
- `H = { line ∈ M | hits(line) > 0 }` be the covered changed lines.

```
file coverage   = |H| / |M| × 100
change coverage = Σ|H| / Σ|M| × 100
```

`M` is the denominator. `H` is the numerator. Lines outside `M` never affect the result.

## What counts

A line is counted when it is **added on the head side** of a unified diff:

- a brand-new line in a new file;
- a new line in an existing file;
- the replacement line of a modification. A modified line is represented by
  `-old` + `+new`, so the `+new` line is in `A`.

This is why "new lines + modified lines" is one set, not two: in a diff, a
modified line always has a head-side line number in `A`.

## What does not count

- **Deleted lines.** They have no head-side line number.
- **Context lines.** Unchanged lines inside a hunk.
- **Pure moves / renames with identical content.** Git's rename detection
  produces no added lines, so the file contributes nothing.
- **Non-executable lines already excluded by the coverage report.** Blank
  lines, comments, braces, type-only declarations and similar lines are not
  executable, so they are not in `C`.
- **Lines outside the configured scope.** Test files, generated code,
  declarations and anything matched by `exclude` are skipped before the
  intersection. In a monorepo, files outside the directory DiffCov runs from
  are skipped too.

## Lines that are added but not instrumented

`A \ C` is reported as `uninstrumented`. These are lines that changed but that
the coverage report does not model. Typical cases:

- a continuation line inside a multi-line statement (Istanbul-style reports
  attach the statement to its opening line);
- a comment or a type-only line in a file that _is_ in the report;
- code excluded by the project's own coverage configuration.

They are **not** part of the denominator. The report shows the count so the
number is not silently inflated or deflated.

## Files missing from the coverage report

This is the most important failure mode. A changed file can be absent from the
report because:

- it is new and no test imports it, and `coverage.include` does not cover it;
- the coverage run was partial (`--changed`, `related`, sharding);
- the report was produced before the file existed.

Default behaviour is `missing: "fail"`: the check exits with a configuration
error instead of guessing. Treating the file as zero lines would let an
untested new file pass. Treating every added line as uncovered would count
comments and type declarations against the author.

With Vitest, the fix is to set `coverage.include` to the source globs so
untested files are still emitted with zero hits:

```ts
coverage: {
  provider: 'v8',
  include: ['src/**/*.{ts,tsx}'],
  reporter: ['lcov'],
}
```

## Zero denominator

If no changed file has a measurable line — documentation-only changes, pure
deletions, renames, or changes entirely outside the source scope — the result
is a pass with `0 / 0` and an explicit "no measurable changed lines" note. It is
not reported as 0%.

## Threshold

The threshold is compared as an exact ratio, not against a rounded display
value:

```
covered × 100 >= threshold × measured
```

A result of `89.99%` fails a `90` threshold. The console prints one decimal
place; machine-readable reports include the raw counts.

## Example

Diff:

```diff
@@ -10,0 +11,3 @@
+const total = items.reduce((sum, item) => sum + item.price, 0)
+if (total > 100) {
+  applyDiscount(total)
+}
```

Coverage report for the file:

```
DA:11,1
DA:12,0
DA:13,0
```

Result: `A = {11,12,13}`, `C = {11,12,13}`, `M = {11,12,13}`,
`H = {11}`, coverage `33.3%`.

If line 14 were a closing brace, it would be in `A` but not in `C`, so it would
be excluded from `M` and counted as `uninstrumented`.

## Limitations

- Line coverage only. Branch coverage of changed lines is a separate metric.
- Multi-line statements are attributed to their opening line by the coverage
  tool; a change that only touches a continuation line may be counted as
  uninstrumented.
- Coverage must refer to the same source revision as the diff. DiffCov checks
  report freshness for the CLI and always uses an in-memory map for the Vitest
  reporter.
- Generated bundles and source maps are not resolved. The report must contain
  source paths, which Vitest's built-in providers do.

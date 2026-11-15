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
- **Files absent from the coverage report.** The report is the source of truth
  for which files are measured. A changed file that the report does not contain
  is skipped before the intersection. In a monorepo, files outside the directory
  DiffCov runs from are skipped too.

## Lines that are added but not instrumented

`A \ C` is reported as `uninstrumented`. These are lines that changed but that
the coverage report does not model. Typical cases:

- a continuation line inside a multi-line statement (Istanbul-style reports
  attach the statement to its opening line);
- a comment or a type-only line in a file that _is_ in the report;
- code excluded by the project's own coverage configuration.

They are **not** part of the denominator. The report shows the count so the
number is not silently inflated or deflated.

## Files absent from the coverage report

The coverage report defines the universe of measured files. If a changed file
is absent from the report, DiffCov skips it: it is not counted as 0%, it does
not fail the check, and it is listed under `Skipped` as `not in coverage
report`.

This keeps the tool aligned with the coverage setup: what the coverage tool did
not measure is not DiffCov's call. The trade-off is that a new file with no
tests is invisible unless the coverage run includes it. With Vitest, set
`coverage.include` to the source globs so untested files are emitted with zero
hits:

```ts
coverage: {
  provider: 'v8',
  include: ['src/**/*.{ts,tsx}'],
  reporter: ['lcov'],
}
```

A file that **is** in the report but whose changed lines have zero hits still
counts as uncovered and can fail the threshold.

## Zero denominator

If no changed file has a measurable line — documentation-only changes, pure
deletions, renames, or changes entirely in files absent from the coverage
report — the result is a pass with `0 / 0` and an explicit "no measurable
changed lines" note. It is not reported as 0%.

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

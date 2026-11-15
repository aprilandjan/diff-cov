import { describe, expect, it } from 'vitest'
import { MissingCoverageError } from '../src/errors.js'
import { buildReport } from '../src/report.js'
import type { ChangedFile, CoverageSource, ResolvedBase } from '../src/types.js'

const base: ResolvedBase = {
  mode: 'branch',
  ref: 'origin/main',
  mergeBase: 'a'.repeat(40),
  head: 'b'.repeat(40),
  distance: 1,
  warnings: [],
}

function coverage(files: Record<string, Record<number, number>>): CoverageSource {
  return {
    files: () => Object.keys(files),
    lineHits: (path) => files[path],
  }
}

function change(path: string, lines: number[]): ChangedFile {
  return { path, status: 'modified', added: new Set(lines) }
}

describe('buildReport', () => {
  it('measures only added lines that the coverage report knows about', () => {
    const report = buildReport({
      changes: [change('src/a.ts', [1, 2, 3, 4])],
      bases: [base],
      scope: 'committed',
      coverage: coverage({ 'src/a.ts': { 1: 1, 2: 0, 3: 3 } }),
    })

    expect(report.totals).toMatchObject({
      files: 1,
      added: 4,
      measured: 3,
      covered: 2,
      missing: 1,
      uninstrumented: 1,
    })
    expect(report.totals.percentage).toBeCloseTo(66.6667, 3)
    expect(report.files[0]?.uncoveredLines).toEqual([2])
  })

  it('fails closed when a changed file is missing from coverage', () => {
    expect(() =>
      buildReport({
        changes: [change('src/new.ts', [1])],
        bases: [base],
        scope: 'committed',
        coverage: coverage({}),
      }),
    ).toThrow(MissingCoverageError)
  })

  it('can warn instead of failing on a missing file', () => {
    const report = buildReport({
      changes: [change('src/new.ts', [1])],
      bases: [base],
      scope: 'committed',
      coverage: coverage({}),
      missing: 'warn',
    })
    expect(report.totals.measured).toBe(0)
    expect(report.warnings.join('\n')).toContain('src/new.ts')
  })

  it('excludes test files and non-instrumented changes', () => {
    const report = buildReport({
      changes: [change('src/a.test.ts', [1]), change('src/a.ts', [1])],
      bases: [base],
      scope: 'committed',
      coverage: coverage({ 'src/a.ts': { 1: 1 } }),
    })

    expect(report.totals.measured).toBe(1)
    expect(report.files.find((file) => file.path === 'src/a.test.ts')?.reason).toBe('excluded')
  })

  it('excludes tool config files by default', () => {
    const report = buildReport({
      changes: [change('vite.config.ts', [1]), change('src/config.ts', [1])],
      bases: [base],
      scope: 'committed',
      coverage: coverage({ 'src/config.ts': { 1: 1 } }),
    })

    expect(report.totals.measured).toBe(1)
    expect(report.files.find((file) => file.path === 'vite.config.ts')?.reason).toBe('excluded')
  })

  it('skips files outside the project prefix', () => {
    const report = buildReport({
      changes: [change('packages/a/src/a.ts', [1]), change('packages/b/src/b.ts', [1])],
      bases: [base],
      scope: 'worktree',
      coverage: coverage({
        'packages/a/src/a.ts': { 1: 1 },
        'packages/b/src/b.ts': { 1: 0 },
      }),
      pathPrefix: 'packages/a',
    })

    expect(report.totals.measured).toBe(1)
    expect(report.files.find((file) => file.path === 'packages/b/src/b.ts')?.reason).toBe(
      'not-included',
    )
  })

  it('passes with zero measured lines', () => {
    const report = buildReport({
      changes: [],
      bases: [base],
      scope: 'committed',
      coverage: coverage({}),
    })
    expect(report.totals.measured).toBe(0)
    expect(report.totals.percentage).toBe(100)
  })
})

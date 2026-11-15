import { describe, expect, it } from 'vitest'
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

  it('skips changed files that are not in the coverage report', () => {
    const report = buildReport({
      changes: [change('src/new.ts', [1, 2]), change('README.md', [1])],
      bases: [base],
      scope: 'committed',
      coverage: coverage({}),
    })

    expect(report.totals.measured).toBe(0)
    expect(report.totals.files).toBe(0)
    expect(report.files.map((file) => file.reason)).toEqual(['not-in-report', 'not-in-report'])
  })

  it('counts a changed file whose lines are all uncovered', () => {
    const report = buildReport({
      changes: [change('src/a.ts', [1, 2])],
      bases: [base],
      scope: 'committed',
      coverage: coverage({ 'src/a.ts': { 1: 0, 2: 0 } }),
    })

    expect(report.totals).toMatchObject({ measured: 2, covered: 0, missing: 2 })
    expect(report.totals.percentage).toBe(0)
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
      'outside-project',
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

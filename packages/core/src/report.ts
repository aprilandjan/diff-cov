import picomatch from 'picomatch'
import { MissingCoverageError } from './errors.js'
import type {
  ChangedFile,
  CoverageSource,
  FileReport,
  MissingPolicy,
  Report,
  ReportTotals,
  ResolvedBase,
  Scope,
} from './types.js'

export const DEFAULT_INCLUDE = [
  '**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,vue,svelte}',
]

export const DEFAULT_EXCLUDE = [
  '**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
  '**/__tests__/**',
  '**/*.d.ts',
  '**/dist/**',
  '**/coverage/**',
  '**/*.stories.*',
  '**/generated/**',
]

export interface BuildReportOptions {
  changes: ChangedFile[]
  bases: ResolvedBase[]
  scope: Scope
  coverage: CoverageSource
  coverageFiles?: string[]
  include?: string[]
  exclude?: string[]
  missing?: MissingPolicy
  /** Only consider paths under this repository-relative directory. */
  pathPrefix?: string
}

function percentage(covered: number, measured: number): number {
  return measured === 0 ? 100 : (covered / measured) * 100
}

export function buildReport(options: BuildReportOptions): Report {
  const include = options.include ?? DEFAULT_INCLUDE
  const exclude = options.exclude ?? DEFAULT_EXCLUDE
  const isIncluded = picomatch(include, { dot: true })
  const isExcluded = picomatch(exclude, { dot: true })
  const missingPolicy = options.missing ?? 'fail'
  const prefix = options.pathPrefix?.replace(/\/+$/, '')

  const files: FileReport[] = []
  const warnings = options.bases.flatMap((base) => base.warnings)
  const missingFiles: string[] = []

  for (const change of [...options.changes].sort((a, b) => a.path.localeCompare(b.path))) {
    const added = change.added.size
    const path = change.path

    if (prefix && path !== prefix && !path.startsWith(`${prefix}/`)) {
      files.push(skipped(path, change, added, 'not-included'))
      continue
    }
    if (!isIncluded(path)) {
      files.push(skipped(path, change, added, 'not-included'))
      continue
    }
    if (isExcluded(path)) {
      files.push(skipped(path, change, added, 'excluded'))
      continue
    }

    const hits = options.coverage.lineHits(path)
    if (!hits) {
      missingFiles.push(path)
      files.push(skipped(path, change, added, 'missing-from-coverage'))
      continue
    }

    const measuredLines = [...change.added].filter((line) => hits[line] !== undefined).sort((a, b) => a - b)
    if (measuredLines.length === 0) {
      files.push(skipped(path, change, added, 'no-instrumented-lines'))
      continue
    }

    const uncoveredLines = measuredLines.filter((line) => !((hits[line] ?? 0) > 0))
    const covered = measuredLines.length - uncoveredLines.length
    files.push({
      path,
      status: 'measured',
      change: change.status,
      added,
      measured: measuredLines.length,
      covered,
      missing: uncoveredLines.length,
      uninstrumented: added - measuredLines.length,
      percentage: percentage(covered, measuredLines.length),
      uncoveredLines,
    })
  }

  if (missingFiles.length > 0) {
    if (missingPolicy === 'fail') {
      throw new MissingCoverageError(missingFiles)
    }
    if (missingPolicy === 'warn') {
      warnings.push(
        `Coverage report has no entry for ${missingFiles.length} changed file(s): ${missingFiles.join(', ')}`,
      )
    }
  }

  const measuredFiles = files.filter((file) => file.status === 'measured')
  const totals: ReportTotals = measuredFiles.reduce<ReportTotals>(
    (acc, file) => {
      acc.files += 1
      acc.added += file.added
      acc.measured += file.measured
      acc.covered += file.covered
      acc.missing += file.missing
      acc.uninstrumented += file.uninstrumented
      return acc
    },
    { files: 0, added: 0, measured: 0, covered: 0, missing: 0, uninstrumented: 0, percentage: 100 },
  )
  totals.percentage = percentage(totals.covered, totals.measured)

  if (totals.uninstrumented > 0) {
    warnings.push(
      `${totals.uninstrumented} added line(s) are not in the coverage report and were excluded from the denominator.`,
    )
  }

  return {
    schemaVersion: 1,
    tool: 'diff-cov',
    generatedAt: new Date().toISOString(),
    scope: options.scope,
    bases: options.bases,
    coverageFiles: options.coverageFiles ?? [],
    include,
    exclude,
    ...(prefix ? { pathPrefix: prefix } : {}),
    files,
    totals,
    warnings,
  }
}

function skipped(
  path: string,
  change: ChangedFile,
  added: number,
  reason: FileReport['reason'],
): FileReport {
  return {
    path,
    status: 'skipped',
    reason,
    change: change.status,
    added,
    measured: 0,
    covered: 0,
    missing: 0,
    uninstrumented: 0,
    percentage: 100,
    uncoveredLines: [],
  }
}

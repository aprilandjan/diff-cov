import type {
  ChangedFile,
  CoverageSource,
  FileReport,
  Report,
  ReportTotals,
  ResolvedBase,
  Scope,
} from './types.js'

export interface BuildReportOptions {
  changes: ChangedFile[]
  bases: ResolvedBase[]
  scope: Scope
  coverage: CoverageSource
  coverageFiles?: string[]
  /** Only consider paths under this repository-relative directory. */
  pathPrefix?: string
}

function percentage(covered: number, measured: number): number {
  return measured === 0 ? 100 : (covered / measured) * 100
}

export function buildReport(options: BuildReportOptions): Report {
  const prefix = options.pathPrefix?.replace(/\/+$/, '')
  const files: FileReport[] = []
  const warnings = options.bases.flatMap((base) => base.warnings)

  for (const change of [...options.changes].sort((a, b) => a.path.localeCompare(b.path))) {
    const added = change.added.size
    const path = change.path

    if (prefix && path !== prefix && !path.startsWith(`${prefix}/`)) {
      files.push(skipped(path, change, added, 'outside-project'))
      continue
    }

    const hits = options.coverage.lineHits(path)
    if (!hits) {
      // The coverage report is the source of truth. A changed file that the
      // report does not contain is not measured and does not affect the gate.
      files.push(skipped(path, change, added, 'not-in-report'))
      continue
    }

    const measuredLines = [...change.added]
      .filter((line) => hits[line] !== undefined)
      .sort((a, b) => a - b)
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

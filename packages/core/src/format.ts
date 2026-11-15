import type { Report, Verdict } from './types.js'

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatLines(lines: number[], limit = 20): string {
  if (lines.length === 0) return ''
  const shown = lines.slice(0, limit).join(', ')
  return lines.length > limit ? `${shown}, … +${lines.length - limit}` : shown
}

export function formatReport(report: Report, verdict: Verdict): string {
  const out: string[] = []
  const totals = report.totals

  const status = verdict.passed ? 'PASS' : 'FAIL'
  out.push(
    `Diff coverage ${formatPercent(totals.percentage)} (${totals.covered}/${totals.measured})  ${status}`,
  )

  if (verdict.total !== undefined || verdict.perFile !== undefined) {
    const parts: string[] = []
    if (verdict.total !== undefined) parts.push(`${verdict.total}% total`)
    if (verdict.perFile !== undefined) parts.push(`${verdict.perFile}% per file`)
    out.push(`Threshold: ${parts.join(', ')}`)
  } else {
    out.push('Threshold: none (report only)')
  }

  for (const base of report.bases) {
    out.push(
      `Base: ${base.ref ?? '(none)'} (merge-base ${base.mergeBase.slice(0, 8)}, ` +
        `${base.distance} commit(s) behind)`,
    )
  }
  out.push(
    `Scope: ${report.scope}${report.coverageFiles.length ? ` · coverage ${report.coverageFiles.join(', ')}` : ''}`,
  )
  out.push('')

  if (totals.measured === 0) {
    out.push('No measurable changed lines.')
  } else {
    for (const file of report.files) {
      if (file.status !== 'measured') continue
      out.push(file.path)
      out.push(
        `  ${file.covered}/${file.measured}  ${formatPercent(file.percentage)}` +
          (file.uncoveredLines.length ? `  missing ${formatLines(file.uncoveredLines)}` : ''),
      )
    }
  }

  const skipped = report.files.filter((file) => file.status === 'skipped')
  if (skipped.length > 0) {
    const labels: Record<string, string> = {
      'outside-project': 'outside project',
      'not-in-report': 'not in coverage report',
      'no-instrumented-lines': 'no instrumented lines',
    }
    const byReason = new Map<string, number>()
    for (const file of skipped) {
      const reason = file.reason ?? 'skipped'
      byReason.set(reason, (byReason.get(reason) ?? 0) + 1)
    }
    const summary = [...byReason.entries()]
      .map(([reason, count]) => `${count} ${labels[reason] ?? reason}`)
      .join(', ')
    out.push('')
    out.push(`Skipped: ${skipped.length} file(s) (${summary})`)

    const notable = skipped.filter(
      (file) => file.reason === 'not-in-report' || file.reason === 'no-instrumented-lines',
    )
    for (const file of notable.slice(0, 10)) {
      out.push(`  ${file.path} (${labels[file.reason ?? ''] ?? 'skipped'})`)
    }
    if (notable.length > 10) out.push(`  … +${notable.length - 10} more`)
  }

  out.push('')
  out.push(
    `${totals.files} file(s) · ${totals.measured} measured line(s) · ` +
      `${totals.covered} covered · ${totals.missing} uncovered · ${totals.uninstrumented} uninstrumented`,
  )

  if (report.warnings.length > 0) {
    out.push('')
    for (const warning of report.warnings) out.push(`warning: ${warning}`)
  }

  return out.join('\n')
}

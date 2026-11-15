import type { Report, ThresholdOptions, Verdict } from './types.js'

export function evaluateThreshold(report: Report, options: ThresholdOptions): Verdict {
  const { total, perFile } = options
  const totals = report.totals

  const totalPassed =
    total === undefined || totals.measured === 0 || totals.covered * 100 >= total * totals.measured

  const fileFailures =
    perFile === undefined
      ? []
      : report.files.filter(
          (file) =>
            file.status === 'measured' &&
            file.measured > 0 &&
            file.covered * 100 < perFile * file.measured,
        )

  const passed = totalPassed && fileFailures.length === 0
  let reason: Verdict['reason']
  if (!passed) reason = !totalPassed ? 'below-total' : 'below-per-file'
  else if (total === undefined && perFile === undefined) reason = 'no-threshold'

  return {
    passed,
    ...(total !== undefined ? { total } : {}),
    ...(perFile !== undefined ? { perFile } : {}),
    fileFailures,
    ...(reason ? { reason } : {}),
  }
}

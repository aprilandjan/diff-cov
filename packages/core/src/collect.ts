import { collectChanges } from './diff.js'
import { resolveBase } from './git.js'
import { buildReport } from './report.js'
import type { BaseSpec, CoverageSource, MissingPolicy, Report, Scope } from './types.js'

export interface CollectDiffCoverageOptions {
  cwd: string
  base?: BaseSpec
  scope?: Scope
  coverage: CoverageSource
  coverageFiles?: string[]
  include?: string[]
  exclude?: string[]
  missing?: MissingPolicy
  includeUntracked?: boolean
  pathPrefix?: string
}

export async function collectDiffCoverage(options: CollectDiffCoverageOptions): Promise<Report> {
  const scope = options.scope ?? 'committed'
  const base = await resolveBase(options.cwd, options.base ?? 'auto')
  const changes = await collectChanges(options.cwd, base, {
    scope,
    includeUntracked: options.includeUntracked,
  })

  return buildReport({
    changes,
    bases: [base],
    scope,
    coverage: options.coverage,
    coverageFiles: options.coverageFiles,
    include: options.include,
    exclude: options.exclude,
    missing: options.missing,
    pathPrefix: options.pathPrefix,
  })
}

import { realpathSync } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import pc from 'picocolors'
import {
  buildReport,
  collectChanges,
  DiffCovError,
  evaluateThreshold,
  formatReport,
  getRepoRoot,
  loadConfig,
  resolveBase,
  toPosix,
  type BaseSpec,
  type DiffCovConfig,
  type Report,
  type Scope,
  type Verdict,
} from '@diff-cov/core'
import { DEFAULT_COVERAGE_PATTERNS, loadCoverage } from './coverage.js'

export interface CliOptions {
  cwd?: string
  config?: string
  base?: BaseSpec
  scope?: Scope
  coverage?: string[]
  threshold?: number
  perFileThreshold?: number
  /** @deprecated Use perFileThreshold. */
  perFile?: number
  allowStale?: boolean
  advisory?: boolean
  json?: boolean
  report?: string
  color: boolean
  verbose?: boolean
}

export async function checkFreshness(
  root: string,
  coverageFiles: string[],
  sourcePaths: string[],
): Promise<string | null> {
  const reportStats = await Promise.all(
    coverageFiles.map((file) => stat(resolve(root, file)).catch(() => null)),
  )
  const reportTimes = reportStats
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .map((item) => item.mtimeMs)
  if (reportTimes.length === 0) return null

  const reportTime = Math.min(...reportTimes)
  const sourceTimes = await Promise.all(
    sourcePaths.map((path) =>
      stat(resolve(root, path))
        .then((item) => item.mtimeMs)
        .catch(() => 0),
    ),
  )
  const newestSource = Math.max(0, ...sourceTimes)
  if (newestSource > reportTime + 1000) {
    const newest = sourcePaths[sourceTimes.indexOf(newestSource)]
    return (
      `Coverage report is older than ${newest ?? 'the changed files'}. ` +
      'Re-run tests with coverage, or pass --allow-stale.'
    )
  }
  return null
}

function colorize(text: string, enabled: boolean): string {
  if (!enabled || !pc.isColorSupported) return text
  return text
    .replace(/\bPASS\b/g, pc.green('PASS'))
    .replace(/\bFAIL\b/g, pc.red('FAIL'))
    .replace(/^warning:/gm, pc.yellow('warning:'))
}

export function exitCodeFor(error: unknown): number {
  if (error instanceof DiffCovError) {
    if (['NO_COVERAGE', 'STALE_COVERAGE'].includes(error.code)) return 3
    return 2
  }
  return 2
}

export async function run(options: CliOptions): Promise<number> {
  const requestedCwd = resolve(options.cwd ?? process.cwd())
  const cwd = (() => {
    try {
      return realpathSync(requestedCwd)
    } catch {
      return requestedCwd
    }
  })()
  const root = await getRepoRoot(cwd)
  const localConfig = await loadConfig(cwd, options.config)
  const rootConfig: DiffCovConfig = !options.config && cwd !== root ? await loadConfig(root) : {}
  const config: DiffCovConfig = { ...rootConfig, ...localConfig }

  const scope: Scope = options.scope ?? config.scope ?? 'committed'
  const base: BaseSpec = options.base ?? config.base ?? 'auto'
  const coveragePatterns = options.coverage?.length
    ? options.coverage
    : config.coverage?.length
      ? config.coverage
      : DEFAULT_COVERAGE_PATTERNS
  const threshold = options.threshold ?? config.threshold ?? 90
  const perFile =
    options.perFileThreshold ?? options.perFile ?? config.perFileThreshold ?? config.perFile
  const relativeCwd = relative(root, cwd)
  const pathPrefix = relativeCwd && !relativeCwd.startsWith('..') ? toPosix(relativeCwd) : undefined

  const loaded = await loadCoverage(root, coveragePatterns, cwd)
  if (options.verbose) {
    process.stderr.write(
      `diff-cov: cwd=${cwd}\nroot=${root}\nbase=${base}\ncoverage=${loaded.files.join(', ')}\n`,
    )
  }

  const resolved = await resolveBase(root, base)
  const changes = await collectChanges(root, resolved, {
    scope,
    includeUntracked: config.includeUntracked,
  })

  const report: Report = buildReport({
    changes,
    bases: [resolved],
    scope,
    coverage: loaded.source,
    coverageFiles: loaded.files,
    pathPrefix,
  })

  const measuredPaths = report.files
    .filter((file) => file.status === 'measured')
    .map((file) => file.path)
  const stale = await checkFreshness(root, loaded.files, measuredPaths)
  if (stale) {
    const allowStale = options.allowStale ?? config.allowStale ?? false
    if (!allowStale) {
      throw new DiffCovError(stale, 'STALE_COVERAGE')
    }
    report.warnings.push(stale)
  }

  const verdict: Verdict = evaluateThreshold(report, {
    total: threshold,
    ...(perFile !== undefined ? { perFile } : {}),
  })
  const advisory = options.advisory ?? config.advisory ?? false
  if (advisory && !verdict.passed) {
    report.warnings.push('Advisory mode: threshold failure does not fail the process.')
  }

  if (options.report) {
    const path = resolve(cwd, options.report)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify({ ...report, verdict }, null, 2) + '\n', 'utf8')
  }

  if (options.json) {
    process.stdout.write(JSON.stringify({ ...report, verdict }, null, 2) + '\n')
  } else {
    process.stdout.write(colorize(formatReport(report, verdict), options.color) + '\n')
  }

  return verdict.passed || advisory ? 0 : 1
}

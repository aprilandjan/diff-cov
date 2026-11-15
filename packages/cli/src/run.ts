import { realpathSync } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import pc from 'picocolors'
import {
  buildReport,
  collectChanges,
  countCommits,
  DiffCovError,
  evaluateThreshold,
  formatReport,
  getRepoRoot,
  loadConfig,
  MissingCoverageError,
  refExists,
  resolveBase,
  revParse,
  toPosix,
  type BaseSpec,
  type ChangedFile,
  type DiffCovConfig,
  type MissingPolicy,
  type Report,
  type ResolvedBase,
  type Scope,
  type Verdict,
} from '@diff-cov/core'
import { DEFAULT_COVERAGE_PATTERNS, loadCoverage } from './coverage.js'
import { parsePushRefs, readStdin, type PushRef } from './push.js'

const ZERO_SHA = /^0+$/

export interface CliOptions {
  cwd?: string
  config?: string
  base?: BaseSpec
  scope?: Scope
  push?: boolean
  coverage?: string[]
  threshold?: number
  perFile?: number
  missing?: MissingPolicy
  allowStale?: boolean
  include?: string[]
  exclude?: string[]
  json?: boolean
  report?: string
  color: boolean
  verbose?: boolean
  /** Pre-push stdin, for tests and embedders. */
  stdin?: string
}

function mergeChanges(target: Map<string, ChangedFile>, changes: ChangedFile[]): void {
  for (const change of changes) {
    const existing = target.get(change.path)
    if (!existing) {
      target.set(change.path, { ...change, added: new Set(change.added) })
      continue
    }
    for (const line of change.added) existing.added.add(line)
    if (change.status === 'added') existing.status = 'added'
  }
}

export async function collectPush(
  root: string,
  refs: PushRef[],
): Promise<{ changes: ChangedFile[]; bases: ResolvedBase[]; warnings: string[] }> {
  const headSha = await revParse(root, 'HEAD')
  if (!headSha) throw new DiffCovError('HEAD cannot be resolved.', 'BAD_HEAD')

  const branchRefs = refs.filter(
    (ref) => !ZERO_SHA.test(ref.localSha) && ref.remoteRef.startsWith('refs/heads/'),
  )
  if (branchRefs.length === 0) {
    // No stdin (manual --push) means "everything not on the remote yet".
    // If stdin only contained tag pushes there is nothing to measure.
    if (refs.length > 0) return { changes: [], bases: [], warnings: [] }
    const base = await resolveBase(root, 'new')
    const changes = await collectChanges(root, base, { scope: 'committed' })
    return { changes, bases: [base], warnings: [] }
  }

  const changes = new Map<string, ChangedFile>()
  const bases: ResolvedBase[] = []
  const warnings: string[] = []

  for (const ref of branchRefs) {
    if (ref.localSha !== headSha) {
      throw new DiffCovError(
        `Pushing ${ref.localRef} (${ref.localSha.slice(0, 8)}) while HEAD is ${headSha.slice(0, 8)}. ` +
          'DiffCov reads the worktree coverage report, so it can only check HEAD.',
        'NOT_HEAD',
      )
    }

    let base: ResolvedBase
    if (!ZERO_SHA.test(ref.remoteSha) && (await refExists(root, ref.remoteSha))) {
      base = {
        mode: 'new',
        ref: ref.remoteRef.replace(/^refs\/heads\//, ''),
        mergeBase: ref.remoteSha,
        head: ref.localSha,
        distance: await countCommits(root, ref.remoteSha, ref.localSha),
        warnings: [],
      }
    } else {
      base = await resolveBase(root, 'new', ref.localSha)
      if (!ZERO_SHA.test(ref.remoteSha)) {
        warnings.push(
          `Remote commit ${ref.remoteSha.slice(0, 8)} is not available locally; used ${base.ref} as the base.`,
        )
      }
    }

    if (!bases.some((item) => item.mergeBase === base.mergeBase && item.head === base.head)) {
      bases.push(base)
    }
    mergeChanges(changes, await collectChanges(root, base, { scope: 'committed' }))
  }

  return { changes: [...changes.values()], bases, warnings }
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
  if (error instanceof MissingCoverageError) return 3
  if (error instanceof DiffCovError) {
    if (['NO_COVERAGE', 'MISSING_COVERAGE', 'STALE_COVERAGE'].includes(error.code)) return 3
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
  const base: BaseSpec = options.base ?? config.base ?? (options.push ? 'new' : 'auto')
  const coveragePatterns = options.coverage?.length
    ? options.coverage
    : config.coverage?.length
      ? config.coverage
      : DEFAULT_COVERAGE_PATTERNS
  const include = options.include?.length ? options.include : config.include
  const exclude = options.exclude?.length ? options.exclude : config.exclude
  const missing: MissingPolicy = options.missing ?? config.missing ?? 'fail'
  const threshold = options.threshold ?? config.threshold ?? 90
  const perFile = options.perFile ?? config.perFile
  const relativeCwd = relative(root, cwd)
  const pathPrefix = relativeCwd && !relativeCwd.startsWith('..') ? toPosix(relativeCwd) : undefined

  const loaded = await loadCoverage(root, coveragePatterns, cwd)
  if (options.verbose) {
    process.stderr.write(
      `diff-cov: cwd=${cwd}\nroot=${root}\nbase=${base}\ncoverage=${loaded.files.join(', ')}\n`,
    )
  }

  let changes: ChangedFile[]
  let bases: ResolvedBase[]
  let scopeUsed: Scope = scope

  if (options.push) {
    const input = options.stdin ?? (await readStdin())
    const refs = parsePushRefs(input)
    const push = await collectPush(root, refs)
    changes = push.changes
    bases = push.bases
    scopeUsed = 'committed'
  } else {
    const resolved = await resolveBase(root, base)
    changes = await collectChanges(root, resolved, {
      scope,
      includeUntracked: config.includeUntracked,
    })
    bases = [resolved]
  }

  const report: Report = buildReport({
    changes,
    bases,
    scope: scopeUsed,
    coverage: loaded.source,
    coverageFiles: loaded.files,
    include,
    exclude,
    missing,
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

  return verdict.passed ? 0 : 1
}

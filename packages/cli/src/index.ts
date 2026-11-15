#!/usr/bin/env node
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { Command, Option } from 'commander'
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
  type BaseSpec,
  type ChangedFile,
  type DiffCovConfig,
  type MissingPolicy,
  type Report,
  type ResolvedBase,
  type Scope,
  type Verdict,
} from 'diff-cov-core'
import { DEFAULT_COVERAGE_PATTERNS, loadCoverage } from './coverage.js'
import { parsePushRefs, readStdin, type PushRef } from './push.js'

const ZERO_SHA = /^0+$/

interface CliOptions {
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
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

function parseNumber(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`Expected a number, got ${value}`)
  return parsed
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

async function collectPush(
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

async function checkFreshness(
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

function exitCodeFor(error: unknown): number {
  if (error instanceof MissingCoverageError) return 3
  if (error instanceof DiffCovError) {
    if (['NO_COVERAGE', 'MISSING_COVERAGE', 'STALE_COVERAGE'].includes(error.code)) return 3
    return 2
  }
  return 2
}

async function run(options: CliOptions): Promise<number> {
  const cwd = resolve(options.cwd ?? process.cwd())
  const root = await getRepoRoot(cwd)
  const config: DiffCovConfig = await loadConfig(root, options.config)

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
    const input = await readStdin()
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

  const verdict: Verdict = evaluateThreshold(report, { total: threshold, ...(perFile !== undefined ? { perFile } : {}) })

  if (options.report) {
    const path = resolve(root, options.report)
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

function createProgram(): Command {
  const program = new Command()
  program
    .name('diff-cov')
    .description('Line coverage of the lines a git diff adds or modifies.')
    .version('0.0.0')
    .option('--cwd <dir>', 'working directory', process.cwd())
    .option('--config <path>', 'config file')
    .option('--base <ref>', 'base ref, "auto" or "new"')
    .addOption(new Option('--scope <scope>', 'diff scope').choices(['committed', 'worktree']))
    .option('--push', 'pre-push mode: read refs from stdin')
    .option('--coverage <path>', 'coverage report path or glob (repeatable)', collect, [])
    .option('--threshold <percent>', 'total diff coverage threshold', parseNumber)
    .option('--per-file <percent>', 'per-file diff coverage threshold', parseNumber)
    .addOption(
      new Option('--missing <policy>', 'what to do when a changed file is absent from coverage')
        .choices(['fail', 'warn', 'ignore']),
    )
    .option('--allow-stale', 'accept a coverage report older than the changed files')
    .option('--include <glob>', 'source glob to include (repeatable)', collect, [])
    .option('--exclude <glob>', 'glob to exclude (repeatable)', collect, [])
    .option('--json', 'print JSON instead of text')
    .option('--report <path>', 'write a JSON report')
    .option('--no-color', 'disable color')
    .option('--verbose', 'print extra diagnostics')
  return program
}

async function main(): Promise<void> {
  const program = createProgram()
  await program.parseAsync(process.argv)
  const options = program.opts<CliOptions>()
  try {
    process.exitCode = await run(options)
  } catch (error) {
    const code = exitCodeFor(error)
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`diff-cov: ${message}\n`)
    if (options.verbose && error instanceof Error && error.stack) {
      process.stderr.write(`${error.stack}\n`)
    }
    process.exitCode = code
  }
}

void main()

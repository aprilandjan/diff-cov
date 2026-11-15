import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  buildReport,
  collectChanges,
  evaluateThreshold,
  formatReport,
  fromCoverageMap,
  getRepoRoot,
  loadConfig,
  resolveBase,
  type BaseSpec,
  type CoverageMapLike,
  type DiffCovConfig,
  type MissingPolicy,
  type Verdict,
} from 'diff-cov-core'
import type { Reporter, SerializedError, TestModule, TestRunEndReason, Vitest } from 'vitest/node'

export interface DiffCovReporterOptions {
  /** Base ref, "auto" or "new". Defaults to the config file, then "auto". */
  base?: BaseSpec
  include?: string[]
  exclude?: string[]
  /** Total threshold. Defaults to the config file, then 0 (report only). */
  threshold?: number
  perFile?: number
  missing?: MissingPolicy
  /** Set the process exit code when the threshold fails. */
  failOnError?: boolean
  /** Report in watch mode too. Off by default. */
  enabledInWatch?: boolean
  /** Config file path relative to the project root. */
  config?: string
  /** Write a JSON report to this path. */
  report?: string | null
}

export class DiffCovReporter implements Reporter {
  private readonly options: DiffCovReporterOptions
  private ctx: Vitest | null = null
  private coverageMap: CoverageMapLike | null = null
  private runEnded = false
  private done = false
  private reason: TestRunEndReason = 'passed'

  constructor(options: DiffCovReporterOptions = {}) {
    this.options = options
  }

  onInit(ctx: Vitest): void {
    this.ctx = ctx
  }

  onTestRunStart(): void {
    this.coverageMap = null
    this.runEnded = false
    this.done = false
    this.reason = 'passed'
  }

  onCoverage(coverage: unknown): void {
    this.coverageMap = coverage as CoverageMapLike
    // Vitest 3 calls onCoverage after onTestRunEnd; Vitest 4 calls it before.
    if (this.runEnded) void this.finish()
  }

  async onTestRunEnd(
    _testModules: ReadonlyArray<TestModule>,
    _unhandledErrors: ReadonlyArray<SerializedError>,
    reason: TestRunEndReason,
  ): Promise<void> {
    this.runEnded = true
    this.reason = reason
    await this.finish()
  }

  private async finish(): Promise<void> {
    if (this.done || !this.ctx) return
    this.done = true

    const ctx = this.ctx
    const root = ctx.config.root
    const watch = Boolean((ctx.config as { watch?: boolean }).watch)
    if (watch && !this.options.enabledInWatch) return
    if (this.reason === 'interrupted') return

    if (!this.coverageMap) {
      ctx.logger.log('diff-cov: coverage was not collected; run Vitest with --coverage.')
      return
    }

    try {
      const config: DiffCovConfig = await loadConfig(root, this.options.config)
      const gitRoot = await getRepoRoot(root)
      const base = await resolveBase(root, this.options.base ?? config.base ?? 'auto')
      const changes = await collectChanges(root, base, {
        scope: 'worktree',
        includeUntracked: true,
      })
      const report = buildReport({
        changes,
        bases: [base],
        scope: 'worktree',
        coverage: fromCoverageMap(this.coverageMap, {
          root: gitRoot,
          projectRoot: root,
          reportDir: root,
        }),
        include: this.options.include ?? config.include,
        exclude: this.options.exclude ?? config.exclude,
        missing: this.options.missing ?? config.missing ?? 'fail',
      })

      const vitestConfig = ctx.config as {
        changed?: boolean | string
        coverage?: { changed?: boolean | string }
      }
      if (vitestConfig.changed || vitestConfig.coverage?.changed) {
        report.warnings.push(
          'Coverage was collected for a subset of tests; files that did not run may be under-reported.',
        )
      }

      const threshold = this.options.threshold ?? config.threshold ?? 0
      const perFile = this.options.perFile ?? config.perFile
      const verdict = evaluateThreshold(report, {
        total: threshold,
        ...(perFile !== undefined ? { perFile } : {}),
      })

      ctx.logger.log('')
      ctx.logger.log(formatReport(report, verdict))

      const reportPath = this.options.report ?? config.report
      if (reportPath) {
        const path = resolve(root, reportPath)
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, JSON.stringify({ ...report, verdict }, null, 2) + '\n', 'utf8')
      }

      if (this.options.failOnError && !verdict.passed && this.reason !== 'failed' && !watch) {
        process.exitCode = 1
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      ctx.logger.error(`diff-cov: ${message}`)
      if (this.options.failOnError && !watch) {
        process.exitCode = 1
      }
    }
  }
}

export default DiffCovReporter

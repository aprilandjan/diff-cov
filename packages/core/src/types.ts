export type BaseSpec = 'auto' | 'new' | (string & {})

export type BaseMode = 'branch' | 'auto' | 'new'

export interface ResolvedBase {
  /** How the base was chosen. */
  mode: BaseMode
  /** The ref used as the comparison point, when one exists. */
  ref: string | null
  /** The commit the diff starts from. */
  mergeBase: string
  /** The commit or worktree side of the diff. */
  head: string
  /** Commits between mergeBase and head. */
  distance: number
  warnings: string[]
}

export type Scope = 'committed' | 'worktree'

export type MissingPolicy = 'fail' | 'warn' | 'ignore'

export type ChangeStatus = 'added' | 'modified' | 'renamed'

export interface ChangedFile {
  /** Repository-relative POSIX path on the head side. */
  path: string
  /** Repository-relative path before a rename. */
  oldPath?: string
  status: ChangeStatus
  /** Added line numbers on the head side. */
  added: Set<number>
}

export interface CoverageSource {
  files(): string[]
  lineHits(path: string): Record<number, number> | undefined
}

export type FileStatus = 'measured' | 'skipped'

export type SkipReason =
  | 'excluded'
  | 'not-included'
  | 'missing-from-coverage'
  | 'no-instrumented-lines'

export interface FileReport {
  path: string
  status: FileStatus
  reason?: SkipReason
  change?: ChangeStatus
  /** Added lines in the diff, before instrumentation filtering. */
  added: number
  /** Added lines that appear in the coverage report. */
  measured: number
  covered: number
  missing: number
  /** Added lines that the coverage report does not model. */
  uninstrumented: number
  percentage: number
  uncoveredLines: number[]
}

export interface ReportTotals {
  files: number
  added: number
  measured: number
  covered: number
  missing: number
  uninstrumented: number
  percentage: number
}

export interface Report {
  schemaVersion: 1
  tool: 'diff-cov'
  generatedAt: string
  scope: Scope
  bases: ResolvedBase[]
  coverageFiles: string[]
  include: string[]
  exclude: string[]
  files: FileReport[]
  totals: ReportTotals
  warnings: string[]
}

export interface ThresholdOptions {
  total?: number
  perFile?: number
}

export interface Verdict {
  passed: boolean
  total?: number
  perFile?: number
  fileFailures: FileReport[]
  reason?: 'below-total' | 'below-per-file' | 'no-threshold'
}

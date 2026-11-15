import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

export interface PathContext {
  /** Git repository root. Diff paths are relative to this. */
  root: string
  /** Vitest project root. Coverage paths are often relative to this. */
  projectRoot?: string
  /** Directory that contains the coverage report. */
  reportDir: string
  /** Cobertura `<source>` entries. */
  sources?: string[]
}

export function toPosix(path: string): string {
  return path.replace(/\\/g, '/')
}

function canonical(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/**
 * Coverage reports mix absolute paths, paths relative to the project root,
 * paths relative to the report, and paths relative to a `<source>` entry.
 * Resolve all of them to a repository-relative POSIX path.
 */
export function normalizeCoveragePath(raw: string, context: PathContext): string {
  const cleaned = raw.trim().replace(/\\/g, '/')
  if (!cleaned) return cleaned

  const root = canonical(context.root)
  if (isAbsolute(cleaned)) {
    return toPosix(relative(root, canonical(cleaned)))
  }

  const projectRoot = context.projectRoot ? canonical(context.projectRoot) : null
  const reportDir = canonical(context.reportDir)
  // lcov paths are usually relative to the project that produced the report.
  // For a per-package report at packages/a/coverage/lcov.info, that root is
  // packages/a, not the repository root.
  const reportRoot = resolve(reportDir, '..')
  const candidates = [
    resolve(reportRoot, cleaned),
    projectRoot ? resolve(projectRoot, cleaned) : null,
    resolve(root, cleaned),
    resolve(reportDir, cleaned),
    ...(context.sources ?? []).map((source) => resolve(root, source, cleaned)),
  ].filter((candidate): candidate is string => candidate !== null)

  const found = candidates.find((candidate) => existsSync(candidate))
  const chosen = canonical(found ?? resolve(reportRoot, cleaned))
  return toPosix(relative(root, chosen))
}

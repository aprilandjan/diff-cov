export { collectDiffCoverage, type CollectDiffCoverageOptions } from './collect.js'
export { collectChanges, parseDiff, type CollectChangesOptions } from './diff.js'
export { loadConfig, type DiffCovConfig } from './config.js'
export { DiffCovError, MissingCoverageError } from './errors.js'
export { formatReport } from './format.js'
export {
  commitTime,
  countCommits,
  getCurrentBranch,
  getRemotes,
  getRepoRoot,
  isShallow,
  listRemoteRefs,
  mergeBase,
  refExists,
  resolveBase,
  revParse,
  runGit,
  type RemoteRef,
} from './git.js'
export {
  buildReport,
  DEFAULT_EXCLUDE,
  DEFAULT_INCLUDE,
  type BuildReportOptions,
} from './report.js'
export { evaluateThreshold } from './threshold.js'
export * from './types.js'
export { parseCobertura } from './coverage/cobertura.js'
export { parseLcov } from './coverage/lcov.js'
export {
  fromCoverageMap,
  mergeCoverage,
  type CoverageMapLike,
} from './coverage/memory.js'
export { normalizeCoveragePath, toPosix, type PathContext } from './coverage/path.js'

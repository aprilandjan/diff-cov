import { readFile } from 'node:fs/promises'
import { dirname, relative } from 'node:path'
import { glob } from 'tinyglobby'
import {
  DiffCovError,
  mergeCoverage,
  parseCobertura,
  parseLcov,
  type CoverageSource,
} from 'diff-cov-core'

export const DEFAULT_COVERAGE_PATTERNS = [
  'coverage/lcov.info',
  'coverage/cobertura-coverage.xml',
  'coverage/cobertura.xml',
]

export interface LoadedCoverage {
  source: CoverageSource
  files: string[]
}

export async function loadCoverage(
  root: string,
  patterns: string[] = DEFAULT_COVERAGE_PATTERNS,
  projectRoot: string = root,
): Promise<LoadedCoverage> {
  const files = await glob(patterns, {
    cwd: root,
    absolute: true,
    onlyFiles: true,
    dot: true,
  })

  if (files.length === 0) {
    throw new DiffCovError(
      `No coverage report found (looked for ${patterns.join(', ')}). ` +
        'Run your tests with coverage first, or pass --coverage <path>.',
      'NO_COVERAGE',
    )
  }

  const sources: CoverageSource[] = []
  for (const file of files) {
    const text = await readFile(file, 'utf8')
    const context = { root, projectRoot, reportDir: dirname(file) }
    if (file.endsWith('.xml') || text.trimStart().startsWith('<')) {
      sources.push(parseCobertura(text, context))
    } else {
      sources.push(parseLcov(text, context))
    }
  }

  return {
    source: mergeCoverage(sources),
    files: files.map((file) => relative(root, file)),
  }
}

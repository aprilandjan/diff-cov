import type { CoverageSource } from '../types.js'
import { normalizeCoveragePath, type PathContext } from './path.js'

export interface CoverageMapLike {
  files(): string[]
  fileCoverageFor(file: string): {
    getLineCoverage(): Record<number, number>
  }
}

/**
 * Adapt Vitest's in-memory `CoverageMap` (v8 and istanbul providers) to the
 * shape the core understands. Duck-typed on purpose: the reporter should not
 * depend on a specific istanbul package version.
 */
export function fromCoverageMap(map: CoverageMapLike, context: PathContext): CoverageSource {
  const records = new Map<string, Record<number, number>>()
  for (const file of map.files()) {
    const path = normalizeCoveragePath(file, context)
    records.set(path, map.fileCoverageFor(file).getLineCoverage())
  }
  return {
    files: () => [...records.keys()],
    lineHits: (path) => records.get(path),
  }
}

export function mergeCoverage(sources: CoverageSource[]): CoverageSource {
  const records = new Map<string, Record<number, number>>()
  for (const source of sources) {
    for (const file of source.files()) {
      const hits = source.lineHits(file)
      if (!hits) continue
      const existing = records.get(file) ?? {}
      for (const [line, value] of Object.entries(hits)) {
        const key = Number(line)
        existing[key] = Math.max(existing[key] ?? 0, value)
      }
      records.set(file, existing)
    }
  }
  return {
    files: () => [...records.keys()],
    lineHits: (path) => records.get(path),
  }
}

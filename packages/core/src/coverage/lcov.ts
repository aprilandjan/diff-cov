import type { CoverageSource } from '../types.js'
import { normalizeCoveragePath, type PathContext } from './path.js'

export function parseLcov(text: string, context: PathContext): CoverageSource {
  const records = new Map<string, Record<number, number>>()
  let currentPath: string | null = null
  let currentHits: Record<number, number> = {}

  const commit = () => {
    if (!currentPath) return
    const existing = records.get(currentPath)
    if (!existing) {
      records.set(currentPath, currentHits)
    } else {
      for (const [line, hits] of Object.entries(currentHits)) {
        const key = Number(line)
        existing[key] = Math.max(existing[key] ?? 0, hits)
      }
    }
    currentPath = null
    currentHits = {}
  }

  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith('SF:')) {
      commit()
      currentPath = normalizeCoveragePath(raw.slice(3), context)
      currentHits = {}
      continue
    }
    if (raw.startsWith('DA:')) {
      const [linePart, hitsPart] = raw.slice(3).split(',')
      const line = Number(linePart)
      const hits = Number(hitsPart)
      if (!Number.isFinite(line) || line <= 0) continue
      currentHits[line] = Math.max(currentHits[line] ?? 0, Number.isFinite(hits) ? hits : 0)
      continue
    }
    if (raw === 'end_of_record') {
      commit()
    }
  }
  commit()

  return {
    files: () => [...records.keys()],
    lineHits: (path) => records.get(path),
  }
}

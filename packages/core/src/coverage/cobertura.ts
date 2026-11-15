import { XMLParser } from 'fast-xml-parser'
import type { CoverageSource } from '../types.js'
import { normalizeCoveragePath, type PathContext } from './path.js'

type UnknownRecord = Record<string, unknown>

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === 'object' ? (value as UnknownRecord) : undefined
}

function collectClasses(node: unknown): UnknownRecord[] {
  const packages = asRecord(node)
  if (!packages) return []
  const classes: UnknownRecord[] = []
  for (const pkg of asArray(packages.package)) {
    const record = asRecord(pkg)
    const container = asRecord(record?.classes)
    for (const cls of asArray(container?.class)) {
      const classRecord = asRecord(cls)
      if (classRecord) classes.push(classRecord)
    }
  }
  return classes
}

function readHits(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function parseCobertura(xml: string, context: PathContext): CoverageSource {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' })
  const document = parser.parse(xml) as UnknownRecord
  const coverage = asRecord(document.coverage)
  if (!coverage) {
    throw new Error('Not a Cobertura report: missing <coverage> root.')
  }

  const sources = asArray(asRecord(coverage.sources)?.source)
    .map((source) => String(source).trim())
    .filter(Boolean)
  const pathContext: PathContext = { ...context, sources }

  const records = new Map<string, Record<number, number>>()
  for (const cls of collectClasses(coverage.packages)) {
    const filename = cls.filename
    if (typeof filename !== 'string' || !filename) continue
    const path = normalizeCoveragePath(filename, pathContext)
    const existing = records.get(path) ?? {}
    const lines = asArray(asRecord(cls.lines)?.line)
    for (const lineNode of lines) {
      const line = asRecord(lineNode)
      if (!line) continue
      const number = Number(line.number)
      if (!Number.isFinite(number) || number <= 0) continue
      existing[number] = Math.max(existing[number] ?? 0, readHits(line.hits))
    }
    records.set(path, existing)
  }

  return {
    files: () => [...records.keys()],
    lineHits: (path) => records.get(path),
  }
}

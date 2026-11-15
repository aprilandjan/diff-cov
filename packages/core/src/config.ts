import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DiffCovError } from './errors.js'
import type { BaseSpec, MissingPolicy, Scope } from './types.js'

export interface DiffCovConfig {
  base?: BaseSpec
  scope?: Scope
  coverage?: string[]
  include?: string[]
  exclude?: string[]
  threshold?: number
  perFile?: number
  missing?: MissingPolicy
  allowStale?: boolean
  includeUntracked?: boolean
  report?: string | null
}

const CONFIG_FILES = ['diff-cov.config.mjs', 'diff-cov.config.js', 'diff-cov.config.cjs']

const KEYS = new Set([
  'base',
  'scope',
  'coverage',
  'include',
  'exclude',
  'threshold',
  'perFile',
  'missing',
  'allowStale',
  'includeUntracked',
  'report',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function invalid(source: string, message: string): never {
  throw new DiffCovError(`Invalid config ${source}: ${message}`, 'BAD_CONFIG')
}

function stringArray(value: unknown, key: string, source: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    invalid(source, `"${key}" must be an array of strings`)
  }
  return value as string[]
}

function percentage(value: unknown, key: string, source: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    invalid(source, `"${key}" must be a number between 0 and 100`)
  }
  return value
}

export function validateConfig(value: unknown, source: string): DiffCovConfig {
  if (!isRecord(value)) invalid(source, 'expected an object')

  for (const key of Object.keys(value)) {
    if (!KEYS.has(key)) invalid(source, `unknown key "${key}"`)
  }

  const config: DiffCovConfig = {}

  if (value.base !== undefined) {
    if (typeof value.base !== 'string' || value.base.length === 0) {
      invalid(source, '"base" must be a non-empty string')
    }
    config.base = value.base
  }
  if (value.scope !== undefined) {
    if (value.scope !== 'committed' && value.scope !== 'worktree') {
      invalid(source, '"scope" must be "committed" or "worktree"')
    }
    config.scope = value.scope
  }
  if (value.coverage !== undefined)
    config.coverage = stringArray(value.coverage, 'coverage', source)
  if (value.include !== undefined) config.include = stringArray(value.include, 'include', source)
  if (value.exclude !== undefined) config.exclude = stringArray(value.exclude, 'exclude', source)
  if (value.threshold !== undefined)
    config.threshold = percentage(value.threshold, 'threshold', source)
  if (value.perFile !== undefined) config.perFile = percentage(value.perFile, 'perFile', source)
  if (value.missing !== undefined) {
    if (value.missing !== 'fail' && value.missing !== 'warn' && value.missing !== 'ignore') {
      invalid(source, '"missing" must be "fail", "warn" or "ignore"')
    }
    config.missing = value.missing
  }
  if (value.allowStale !== undefined) {
    if (typeof value.allowStale !== 'boolean') invalid(source, '"allowStale" must be a boolean')
    config.allowStale = value.allowStale
  }
  if (value.includeUntracked !== undefined) {
    if (typeof value.includeUntracked !== 'boolean') {
      invalid(source, '"includeUntracked" must be a boolean')
    }
    config.includeUntracked = value.includeUntracked
  }
  if (value.report !== undefined) {
    if (value.report !== null && typeof value.report !== 'string') {
      invalid(source, '"report" must be a string or null')
    }
    config.report = value.report
  }

  return config
}

export async function loadConfig(root: string, explicit?: string): Promise<DiffCovConfig> {
  if (explicit) {
    const path = resolve(root, explicit)
    if (!existsSync(path)) {
      throw new DiffCovError(`Config file not found: ${path}`, 'BAD_CONFIG')
    }
    const module = await import(pathToFileURL(path).href)
    return validateConfig(module.default ?? module, path)
  }

  for (const name of CONFIG_FILES) {
    const path = join(root, name)
    if (!existsSync(path)) continue
    const module = await import(pathToFileURL(path).href)
    return validateConfig(module.default ?? module, path)
  }

  const packagePath = join(root, 'package.json')
  if (existsSync(packagePath)) {
    const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as Record<string, unknown>
    if (pkg.diffCov !== undefined) {
      return validateConfig(pkg.diffCov, `${packagePath}#diffCov`)
    }
  }

  return {}
}

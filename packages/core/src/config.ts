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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validate(config: unknown, source: string): DiffCovConfig {
  if (!isRecord(config)) {
    throw new DiffCovError(`Config ${source} must export an object.`, 'BAD_CONFIG')
  }
  return config as DiffCovConfig
}

export async function loadConfig(root: string, explicit?: string): Promise<DiffCovConfig> {
  if (explicit) {
    const path = resolve(root, explicit)
    if (!existsSync(path)) {
      throw new DiffCovError(`Config file not found: ${path}`, 'BAD_CONFIG')
    }
    const module = await import(pathToFileURL(path).href)
    return validate(module.default ?? module, path)
  }

  for (const name of CONFIG_FILES) {
    const path = join(root, name)
    if (!existsSync(path)) continue
    const module = await import(pathToFileURL(path).href)
    return validate(module.default ?? module, path)
  }

  const packagePath = join(root, 'package.json')
  if (existsSync(packagePath)) {
    const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as Record<string, unknown>
    if (pkg.diffCov !== undefined) {
      return validate(pkg.diffCov, `${packagePath}#diffCov`)
    }
  }

  return {}
}

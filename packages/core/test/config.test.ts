import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadConfig, validateConfig } from '../src/config.js'
import { DiffCovError } from '../src/errors.js'

describe('validateConfig', () => {
  it('accepts a complete config', () => {
    expect(
      validateConfig(
        {
          base: 'auto',
          scope: 'worktree',
          coverage: ['coverage/lcov.info'],
          include: ['src/**/*.ts'],
          exclude: ['**/*.test.ts'],
          threshold: 90,
          perFileThreshold: 80,
          missing: 'fail',
          allowStale: false,
          includeUntracked: true,
          advisory: true,
          report: 'coverage/diff-cov.json',
        },
        'test',
      ),
    ).toEqual({
      base: 'auto',
      scope: 'worktree',
      coverage: ['coverage/lcov.info'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      threshold: 90,
      perFileThreshold: 80,
      missing: 'fail',
      allowStale: false,
      includeUntracked: true,
      advisory: true,
      report: 'coverage/diff-cov.json',
    })
  })

  it('still accepts the deprecated perFile key', () => {
    expect(validateConfig({ perFile: 80 }, 'test')).toEqual({ perFile: 80 })
  })

  it('rejects unknown keys', () => {
    expect(() => validateConfig({ treshold: 90 }, 'test')).toThrow(DiffCovError)
  })

  it('rejects out-of-range thresholds', () => {
    expect(() => validateConfig({ threshold: 101 }, 'test')).toThrow(/between 0 and 100/)
  })

  it('rejects wrong types', () => {
    expect(() => validateConfig({ coverage: 'coverage/lcov.info' }, 'test')).toThrow(
      /array of strings/,
    )
    expect(() => validateConfig({ scope: 'all' }, 'test')).toThrow(/committed/)
    expect(() => validateConfig({ advisory: 'yes' }, 'test')).toThrow(/boolean/)
  })
})

describe('loadConfig', () => {
  it('reads package.json#diffCov', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diff-cov-config-'))
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ diffCov: { base: 'new', threshold: 85 } }),
      'utf8',
    )
    expect(await loadConfig(root)).toEqual({ base: 'new', threshold: 85 })
  })

  it('reads diff-cov.config.mjs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diff-cov-config-'))
    await writeFile(
      join(root, 'diff-cov.config.mjs'),
      'export default { base: "auto", missing: "warn" }\n',
      'utf8',
    )
    expect(await loadConfig(root)).toEqual({ base: 'auto', missing: 'warn' })
  })
})

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseLcov } from '../src/coverage/lcov.js'

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'diff-cov-lcov-'))
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src', 'a.ts'), 'export const a = 1\n', 'utf8')
  return root
}

describe('parseLcov', () => {
  it('parses line hits and normalizes paths', async () => {
    const root = await makeRoot()
    const lcov = [
      'TN:',
      `SF:${join(root, 'src', 'a.ts')}`,
      'DA:1,1',
      'DA:2,0',
      'DA:2,3',
      'end_of_record',
      '',
    ].join('\n')

    const source = parseLcov(lcov, { root, reportDir: root })
    expect(source.files()).toEqual(['src/a.ts'])
    expect(source.lineHits('src/a.ts')).toEqual({ 1: 1, 2: 3 })
  })

  it('resolves paths relative to a per-package report directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diff-cov-lcov-'))
    await mkdir(join(root, 'packages', 'a', 'src'), { recursive: true })
    await writeFile(join(root, 'packages', 'a', 'src', 'math.ts'), 'x\n', 'utf8')

    const lcov = ['SF:src/math.ts', 'DA:1,1', 'end_of_record', ''].join('\n')
    const source = parseLcov(lcov, {
      root,
      projectRoot: root,
      reportDir: join(root, 'packages', 'a', 'coverage'),
    })

    expect(source.files()).toEqual(['packages/a/src/math.ts'])
    expect(source.lineHits('packages/a/src/math.ts')).toEqual({ 1: 1 })
  })

  it('merges duplicate records with max hits', async () => {
    const root = await makeRoot()
    const lcov = [
      'SF:src/a.ts',
      'DA:1,0',
      'end_of_record',
      'SF:src/a.ts',
      'DA:1,2',
      'end_of_record',
      '',
    ].join('\n')

    const source = parseLcov(lcov, { root, reportDir: root })
    expect(source.lineHits('src/a.ts')).toEqual({ 1: 2 })
  })
})

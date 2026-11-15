import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runGit } from '@diff-cov/core'
import { run } from '../src/run.js'

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'diff-cov-e2e-'))
  await runGit(root, ['init', '-b', 'main'])
  await runGit(root, ['config', 'user.email', 'test@example.com'])
  await runGit(root, ['config', 'user.name', 'DiffCov Test'])
  await runGit(root, ['config', 'commit.gpgsign', 'false'])
  await write(root, 'src/a.ts', 'line1\n')
  await commit(root, 'init')
  return root
}

async function write(root: string, path: string, content: string): Promise<void> {
  const full = join(root, path)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, content, 'utf8')
}

async function commit(root: string, message: string): Promise<void> {
  await runGit(root, ['add', '-A'])
  await runGit(root, ['commit', '-m', message])
}

function captureStdout(): { write: ReturnType<typeof vi.spyOn>; output: () => string } {
  let text = ''
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    text += String(chunk)
    return true
  }) as never)
  return { write, output: () => text }
}

const lcov = ['SF:src/a.ts', 'DA:1,1', 'DA:2,0', 'DA:3,1', 'end_of_record', ''].join('\n')

const cobertura = `<?xml version="1.0"?>
<coverage>
  <packages>
    <package name="src">
      <classes>
        <class name="A" filename="src/a.ts">
          <lines>
            <line number="1" hits="1"/>
            <line number="2" hits="0"/>
            <line number="3" hits="1"/>
          </lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>`

describe('cli e2e', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('measures a worktree diff from an lcov report', async () => {
    const root = await makeRepo()
    await write(root, 'src/a.ts', 'line1\nline2\nline3\n')
    await write(root, 'coverage/lcov.info', lcov)

    const stdout = captureStdout()
    const code = await run({
      cwd: root,
      base: 'HEAD',
      scope: 'worktree',
      coverage: ['coverage/lcov.info'],
      threshold: 90,
      color: false,
    })

    expect(code).toBe(1)
    expect(stdout.output()).toContain('Diff coverage 50.0% (1/2)')
    expect(stdout.output()).toContain('FAIL')
  })

  it('reports a threshold failure without failing in advisory mode', async () => {
    const root = await makeRepo()
    await write(root, 'src/a.ts', 'line1\nline2\nline3\n')
    await write(root, 'coverage/lcov.info', lcov)

    const stdout = captureStdout()
    const code = await run({
      cwd: root,
      base: 'HEAD',
      scope: 'worktree',
      coverage: ['coverage/lcov.info'],
      threshold: 90,
      advisory: true,
      color: false,
    })

    expect(code).toBe(0)
    expect(stdout.output()).toContain('Diff coverage 50.0% (1/2)')
    expect(stdout.output()).toContain('FAIL')
    expect(stdout.output()).toContain('Advisory mode')
  })

  it('measures a worktree diff from a Cobertura report', async () => {
    const root = await makeRepo()
    await write(root, 'src/a.ts', 'line1\nline2\nline3\n')
    await write(root, 'coverage/cobertura-coverage.xml', cobertura)

    const stdout = captureStdout()
    const code = await run({
      cwd: root,
      base: 'HEAD',
      scope: 'worktree',
      coverage: ['coverage/cobertura-coverage.xml'],
      threshold: 90,
      color: false,
    })

    expect(code).toBe(1)
    expect(stdout.output()).toContain('Diff coverage 50.0% (1/2)')
  })

  it('fails with exit code 3 when the report is missing', async () => {
    const root = await makeRepo()
    await write(root, 'src/a.ts', 'line1\nline2\n')

    await expect(
      run({
        cwd: root,
        base: 'HEAD',
        scope: 'worktree',
        coverage: ['coverage/missing.info'],
        threshold: 90,
        color: false,
      }),
    ).rejects.toMatchObject({ code: 'NO_COVERAGE' })
  })

  it('merges per-package lcov reports from the repository root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diff-cov-e2e-'))
    await runGit(root, ['init', '-b', 'main'])
    await runGit(root, ['config', 'user.email', 'test@example.com'])
    await runGit(root, ['config', 'user.name', 'DiffCov Test'])
    await runGit(root, ['config', 'commit.gpgsign', 'false'])

    await write(root, 'packages/a/src/a.ts', 'line1\n')
    await write(root, 'packages/b/src/b.ts', 'line1\n')
    await commit(root, 'init')

    await write(root, 'packages/a/src/a.ts', 'line1\nline2\nline3\n')
    await write(root, 'packages/b/src/b.ts', 'line1\nline2\n')
    await write(
      root,
      'packages/a/coverage/lcov.info',
      ['SF:src/a.ts', 'DA:1,1', 'DA:2,0', 'DA:3,1', 'end_of_record', ''].join('\n'),
    )
    await write(
      root,
      'packages/b/coverage/lcov.info',
      ['SF:src/b.ts', 'DA:1,1', 'DA:2,0', 'end_of_record', ''].join('\n'),
    )

    const stdout = captureStdout()
    const code = await run({
      cwd: root,
      base: 'HEAD',
      scope: 'worktree',
      coverage: ['packages/*/coverage/lcov.info'],
      threshold: 90,
      color: false,
    })

    expect(code).toBe(1)
    expect(stdout.output()).toContain('packages/a/src/a.ts')
    expect(stdout.output()).toContain('packages/b/src/b.ts')
    expect(stdout.output()).toContain('Diff coverage 33.3% (1/3)')
  })
})

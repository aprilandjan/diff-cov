import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { revParse, runGit } from '@diff-cov/core'
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

  it('uses the remote sha from pre-push stdin', async () => {
    const root = await makeRepo()
    const remote = await revParse(root, 'HEAD')
    await runGit(root, ['update-ref', 'refs/remotes/origin/main', remote])
    await write(root, 'src/a.ts', 'line1\nline2\nline3\n')
    await commit(root, 'change')
    await write(root, 'coverage/lcov.info', lcov)
    const local = await revParse(root, 'HEAD')

    const stdout = captureStdout()
    const code = await run({
      cwd: root,
      push: true,
      stdin: `refs/heads/main ${local} refs/heads/main ${remote}\n`,
      coverage: ['coverage/lcov.info'],
      threshold: 90,
      color: false,
    })

    expect(code).toBe(1)
    expect(stdout.output()).toContain('Base: main')
    expect(stdout.output()).toContain('Diff coverage 50.0% (1/2)')
  })
})

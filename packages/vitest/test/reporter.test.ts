import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiffCovReporter } from '../src/index.js'
import { runGit } from 'diff-cov-core'

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'diff-cov-reporter-'))
  await runGit(root, ['init', '-b', 'main'])
  await runGit(root, ['config', 'user.email', 'test@example.com'])
  await runGit(root, ['config', 'user.name', 'DiffCov Test'])
  await runGit(root, ['config', 'commit.gpgsign', 'false'])
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src', 'a.ts'), 'line1\n', 'utf8')
  await runGit(root, ['add', '-A'])
  await runGit(root, ['commit', '-m', 'init'])
  await writeFile(join(root, 'src', 'a.ts'), 'line1\nline2\nline3\n', 'utf8')
  return root
}

function makeContext(root: string) {
  return {
    config: { root, watch: false },
    logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }
}

function makeMap(root: string) {
  const file = join(root, 'src', 'a.ts')
  return {
    files: () => [file],
    fileCoverageFor: () => ({
      getLineCoverage: () => ({ 1: 1, 2: 0, 3: 1 }),
    }),
  }
}

describe('DiffCovReporter', () => {
  afterEach(() => {
    process.exitCode = 0
  })

  it('reports worktree diff coverage and can fail the run', async () => {
    const root = await makeRepo()
    const ctx = makeContext(root)
    const reporter = new DiffCovReporter({
      base: 'HEAD',
      threshold: 90,
      failOnError: true,
    })

    reporter.onInit(ctx as never)
    reporter.onCoverage(makeMap(root))
    await reporter.onTestRunEnd([], [], 'passed')

    const output = ctx.logger.log.mock.calls.map((call) => String(call[0])).join('\n')
    expect(output).toContain('Diff coverage 50.0% (1/2)')
    expect(output).toContain('FAIL')
    expect(process.exitCode).toBe(1)
  })

  it('does not fail when failOnError is off', async () => {
    const root = await makeRepo()
    const ctx = makeContext(root)
    const reporter = new DiffCovReporter({ base: 'HEAD', threshold: 90 })

    reporter.onInit(ctx as never)
    reporter.onCoverage(makeMap(root))
    await reporter.onTestRunEnd([], [], 'passed')

    expect(process.exitCode).toBe(0)
  })
})

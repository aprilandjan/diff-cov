import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectChanges } from '../src/diff.js'
import { resolveBase, revParse, runGit } from '../src/git.js'

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'diff-cov-git-'))
  await runGit(root, ['init', '-b', 'main'])
  await runGit(root, ['config', 'user.email', 'test@example.com'])
  await runGit(root, ['config', 'user.name', 'DiffCov Test'])
  await runGit(root, ['config', 'commit.gpgsign', 'false'])
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

describe('git integration', () => {
  it('resolves merge-base and collects committed added lines', async () => {
    const root = await makeRepo()
    await write(root, 'src/a.ts', 'line1\n')
    await commit(root, 'init')
    const mainSha = await revParse(root, 'HEAD')

    await runGit(root, ['switch', '-c', 'feature'])
    await write(root, 'src/a.ts', 'line1\nline2\nline3\n')
    await commit(root, 'feature')

    const base = await resolveBase(root, 'main')
    expect(base.mode).toBe('branch')
    expect(base.mergeBase).toBe(mainSha)
    expect(base.distance).toBe(1)

    const changes = await collectChanges(root, base, { scope: 'committed' })
    expect(changes).toHaveLength(1)
    expect(changes[0]?.path).toBe('src/a.ts')
    expect([...(changes[0]?.added ?? [])]).toEqual([2, 3])
  })

  it('uses the closest remote-tracking ref in new mode', async () => {
    const root = await makeRepo()
    await write(root, 'src/a.ts', 'line1\n')
    await commit(root, 'init')
    const mainSha = await revParse(root, 'HEAD')
    await runGit(root, ['update-ref', 'refs/remotes/origin/main', mainSha])

    await runGit(root, ['switch', '-c', 'feature'])
    await write(root, 'src/a.ts', 'line1\nline2\n')
    await commit(root, 'feature')

    const base = await resolveBase(root, 'new')
    expect(base.mode).toBe('new')
    expect(base.ref).toBe('origin/main')
    expect(base.mergeBase).toBe(mainSha)
  })

  it('collects unstaged and untracked changes in worktree scope', async () => {
    const root = await makeRepo()
    await write(root, 'src/a.ts', 'line1\n')
    await commit(root, 'init')

    await write(root, 'src/a.ts', 'line1\nline2\n')
    await write(root, 'src/new.ts', 'a\nb\n')

    const base = await resolveBase(root, 'main')
    const changes = await collectChanges(root, base, { scope: 'worktree' })

    const modified = changes.find((file) => file.path === 'src/a.ts')
    const added = changes.find((file) => file.path === 'src/new.ts')
    expect([...(modified?.added ?? [])]).toEqual([2])
    expect(added?.status).toBe('added')
    expect([...(added?.added ?? [])]).toEqual([1, 2])
  })
})

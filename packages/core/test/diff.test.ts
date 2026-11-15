import { describe, expect, it } from 'vitest'
import { parseDiff } from '../src/diff.js'

describe('parseDiff', () => {
  it('collects added lines from multiple hunks', () => {
    const patch = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,0 +2,2 @@',
      '+const a = 1',
      '+const b = 2',
      '@@ -10,1 +12,1 @@',
      '-old',
      '+new',
      '',
    ].join('\n')

    const [file] = parseDiff(patch)
    expect(file?.path).toBe('src/a.ts')
    expect(file?.status).toBe('modified')
    expect([...(file?.added ?? [])]).toEqual([2, 3, 12])
  })

  it('handles a new file', () => {
    const patch = [
      'diff --git a/src/new.ts b/src/new.ts',
      'new file mode 100644',
      'index 0000000..1111111',
      '--- /dev/null',
      '+++ b/src/new.ts',
      '@@ -0,0 +1,3 @@',
      '+a',
      '+b',
      '+c',
      '',
    ].join('\n')

    const [file] = parseDiff(patch)
    expect(file?.path).toBe('src/new.ts')
    expect(file?.status).toBe('added')
    expect([...(file?.added ?? [])]).toEqual([1, 2, 3])
  })

  it('handles a rename', () => {
    const patch = [
      'diff --git a/src/old.ts b/src/new.ts',
      'similarity index 90%',
      'rename from src/old.ts',
      'rename to src/new.ts',
      'index 1111111..2222222 100644',
      '--- a/src/old.ts',
      '+++ b/src/new.ts',
      '@@ -1,1 +1,1 @@',
      '-a',
      '+b',
      '',
    ].join('\n')

    const [file] = parseDiff(patch)
    expect(file?.path).toBe('src/new.ts')
    expect(file?.oldPath).toBe('src/old.ts')
    expect(file?.status).toBe('renamed')
    expect([...(file?.added ?? [])]).toEqual([1])
  })

  it('skips deleted and binary files', () => {
    const patch = [
      'diff --git a/src/gone.ts b/src/gone.ts',
      'deleted file mode 100644',
      '--- a/src/gone.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-a',
      '-b',
      'diff --git a/logo.png b/logo.png',
      'index 1111111..2222222 100644',
      'Binary files a/logo.png and b/logo.png differ',
      '',
    ].join('\n')

    expect(parseDiff(patch)).toEqual([])
  })

  it('keeps paths with spaces', () => {
    const patch = [
      'diff --git a/src/a b.ts b/src/a b.ts',
      '--- a/src/a b.ts',
      '+++ b/src/a b.ts',
      '@@ -1,0 +1,1 @@',
      '+x',
      '',
    ].join('\n')

    const [file] = parseDiff(patch)
    expect(file?.path).toBe('src/a b.ts')
  })
})

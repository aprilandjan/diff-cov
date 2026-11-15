import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getRepoRoot, runGit } from './git.js'
import type { ChangedFile, ResolvedBase, Scope } from './types.js'

const DIFF_ARGS = [
  '-c',
  'core.quotePath=false',
  'diff',
  '--no-color',
  '--no-ext-diff',
  '--unified=0',
  '-M',
  '--src-prefix=a/',
  '--dst-prefix=b/',
]

function toPosix(path: string): string {
  return path.replace(/\\/g, '/')
}

function stripPrefix(path: string): string {
  return path.startsWith('b/') ? path.slice(2) : path
}

function unquoteGitPath(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"')) return path
  const body = path.slice(1, -1)
  return body.replace(/\\(x[0-9a-fA-F]{2}|[0-7]{1,3}|.)/g, (_match, escape: string) => {
    if (escape.startsWith('x')) return String.fromCharCode(Number.parseInt(escape.slice(1), 16))
    if (/^[0-7]+$/.test(escape)) return String.fromCharCode(Number.parseInt(escape, 8))
    switch (escape) {
      case 'n':
        return '\n'
      case 't':
        return '\t'
      case 'r':
        return '\r'
      case '\\':
        return '\\'
      case '"':
        return '"'
      default:
        return escape
    }
  })
}

interface MutableFile {
  path: string
  oldPath?: string
  status: ChangedFile['status']
  added: Set<number>
  deleted: boolean
}

export function parseDiff(patch: string): ChangedFile[] {
  const files: MutableFile[] = []
  let current: MutableFile | null = null

  const finish = () => {
    if (!current) return
    if (!current.deleted && current.path && current.added.size > 0) {
      files.push(current)
    }
    current = null
  }

  const lines = patch.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''

    if (line.startsWith('diff --git ')) {
      finish()
      current = { path: '', status: 'modified', added: new Set(), deleted: false }
      continue
    }
    if (!current) continue

    if (line.startsWith('new file mode ')) {
      current.status = 'added'
      continue
    }
    if (line.startsWith('deleted file mode ')) {
      current.deleted = true
      continue
    }
    if (line.startsWith('rename from ')) {
      current.oldPath = unquoteGitPath(line.slice('rename from '.length))
      current.status = 'renamed'
      continue
    }
    if (line.startsWith('rename to ')) {
      current.path = unquoteGitPath(line.slice('rename to '.length))
      current.status = 'renamed'
      continue
    }
    if (line.startsWith('+++ ')) {
      const raw = unquoteGitPath(line.slice(4))
      if (raw === '/dev/null') {
        current.deleted = true
      } else {
        current.path = stripPrefix(raw)
      }
      continue
    }
    if (line.startsWith('@@ ')) {
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line)
      if (!match) continue

      let oldLeft = match[2] === undefined ? 1 : Number(match[2])
      let newLeft = match[4] === undefined ? 1 : Number(match[4])
      let newLine = Number(match[3])
      let cursor = i + 1

      while (cursor < lines.length && (oldLeft > 0 || newLeft > 0)) {
        const body = lines[cursor] ?? ''
        if (body.startsWith('\\')) {
          cursor += 1
          continue
        }
        const marker = body[0]
        if (marker === '+') {
          current.added.add(newLine)
          newLine += 1
          newLeft -= 1
        } else if (marker === '-') {
          oldLeft -= 1
        } else if (marker === ' ') {
          newLine += 1
          oldLeft -= 1
          newLeft -= 1
        } else {
          break
        }
        cursor += 1
      }
      i = cursor - 1
    }
  }

  finish()
  return files.map((file) => ({
    path: toPosix(file.path),
    ...(file.oldPath ? { oldPath: toPosix(file.oldPath) } : {}),
    status: file.status,
    added: file.added,
  }))
}

function countLines(content: string): number {
  if (content.length === 0) return 0
  const normalized = content.endsWith('\n') ? content.slice(0, -1) : content
  return normalized.split('\n').length
}

function mergeChangedFiles(files: ChangedFile[]): ChangedFile[] {
  const merged = new Map<string, ChangedFile>()
  for (const file of files) {
    const existing = merged.get(file.path)
    if (!existing) {
      merged.set(file.path, { ...file, added: new Set(file.added) })
      continue
    }
    for (const line of file.added) existing.added.add(line)
    if (file.status === 'added') existing.status = 'added'
  }
  return [...merged.values()]
}

export interface CollectChangesOptions {
  scope: Scope
  includeUntracked?: boolean
}

export async function collectChanges(
  cwd: string,
  base: ResolvedBase,
  options: CollectChangesOptions,
): Promise<ChangedFile[]> {
  const root = await getRepoRoot(cwd)
  const args = [...DIFF_ARGS]
  if (options.scope === 'committed') {
    args.push(base.mergeBase, base.head)
  } else {
    args.push(base.mergeBase)
  }

  const patch = await runGit(root, args)
  const files = parseDiff(patch)

  if (options.scope === 'worktree' && options.includeUntracked !== false) {
    const out = await runGit(root, ['ls-files', '--others', '--exclude-standard', '-z'], {
      allowFailure: true,
    })
    for (const relative of out.split('\0')) {
      if (!relative) continue
      const content = await readFile(join(root, relative), 'utf8').catch(() => null)
      if (content === null) continue
      const count = countLines(content)
      if (count === 0) continue
      const added = new Set<number>()
      for (let line = 1; line <= count; line += 1) added.add(line)
      files.push({ path: toPosix(relative), status: 'added', added })
    }
  }

  return mergeChangedFiles(files)
}

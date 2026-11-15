import { execFile } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { promisify } from 'node:util'
import { DiffCovError } from './errors.js'
import type { BaseSpec, ResolvedBase } from './types.js'

const execFileAsync = promisify(execFile)

const GIT_MAX_BUFFER = 64 * 1024 * 1024

export interface RemoteRef {
  /** Short name, e.g. origin/main. */
  name: string
  /** Full ref name, e.g. refs/remotes/origin/main. */
  fullName: string
  sha: string
  /** Committer date, seconds since epoch. */
  date: number
}

export async function runGit(
  cwd: string,
  args: string[],
  options: { allowFailure?: boolean } = {},
): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: GIT_MAX_BUFFER,
      windowsHide: true,
    })
    return stdout
  } catch (error) {
    if (options.allowFailure) return ''
    const err = error as NodeJS.ErrnoException & { stderr?: string }
    const detail = (err.stderr ?? err.message ?? '').trim()
    throw new DiffCovError(
      `git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`,
      'GIT_FAILED',
      { args, detail },
    )
  }
}

export async function getRepoRoot(cwd: string): Promise<string> {
  const out = await runGit(cwd, ['rev-parse', '--show-toplevel'], { allowFailure: true })
  const root = out.trim()
  if (!root) {
    throw new DiffCovError(`${cwd} is not inside a git repository.`, 'NOT_A_REPO')
  }
  try {
    return realpathSync(root)
  } catch {
    return root
  }
}

export async function revParse(cwd: string, ref: string): Promise<string> {
  return (await runGit(cwd, ['rev-parse', '--verify', `${ref}^{commit}`], { allowFailure: true })).trim()
}

export async function refExists(cwd: string, ref: string): Promise<boolean> {
  return Boolean(await revParse(cwd, ref))
}

export async function mergeBase(cwd: string, a: string, b: string): Promise<string | null> {
  const out = await runGit(cwd, ['merge-base', a, b], { allowFailure: true })
  return out.trim() || null
}

export async function commitTime(cwd: string, ref: string): Promise<number> {
  const out = (await runGit(cwd, ['show', '-s', '--format=%ct', ref], { allowFailure: true })).trim()
  return Number(out) || 0
}

export async function countCommits(cwd: string, from: string, to: string): Promise<number> {
  const out = (await runGit(cwd, ['rev-list', '--count', `${from}..${to}`], { allowFailure: true })).trim()
  return Number(out) || 0
}

export async function getCurrentBranch(cwd: string): Promise<string | null> {
  const out = (await runGit(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowFailure: true })).trim()
  return out || null
}

export async function isShallow(cwd: string): Promise<boolean> {
  const out = (await runGit(cwd, ['rev-parse', '--is-shallow-repository'], { allowFailure: true })).trim()
  return out === 'true'
}

export async function getRemotes(cwd: string): Promise<string[]> {
  const out = await runGit(cwd, ['remote'], { allowFailure: true })
  return out.split('\n').map((line) => line.trim()).filter(Boolean)
}

export async function listRemoteRefs(cwd: string): Promise<RemoteRef[]> {
  const format = '%(refname)%09%(refname:short)%09%(objectname)%09%(committerdate:unix)'
  const out = await runGit(
    cwd,
    ['for-each-ref', `--format=${format}`, 'refs/remotes'],
    { allowFailure: true },
  )
  const refs: RemoteRef[] = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const [fullName, name, sha, date] = line.split('\t')
    if (!fullName || !name || !sha) continue
    if (name.endsWith('/HEAD')) continue
    refs.push({ fullName, name, sha, date: Number(date) || 0 })
  }
  return refs
}

const TRUNK_NAMES = new Set(['main', 'master', 'develop', 'development', 'trunk'])

function isTrunkRef(shortName: string, currentBranch: string | null): boolean {
  const slash = shortName.indexOf('/')
  if (slash < 0) return false
  const remote = shortName.slice(0, slash)
  const branch = shortName.slice(slash + 1)
  if (currentBranch && branch === currentBranch && !TRUNK_NAMES.has(branch)) return false
  if (TRUNK_NAMES.has(branch)) return true
  return /^(release|hotfix)\//.test(branch) && remote.length > 0
}

interface ScoredBase {
  ref: string
  mergeBase: string
  time: number
  distance: number
}

async function closestBase(
  cwd: string,
  head: string,
  candidates: RemoteRef[],
): Promise<ScoredBase | null> {
  const scored: ScoredBase[] = []
  for (const candidate of candidates) {
    const base = await mergeBase(cwd, candidate.sha, head)
    if (!base) continue
    scored.push({
      ref: candidate.name,
      mergeBase: base,
      time: await commitTime(cwd, base),
      distance: await countCommits(cwd, base, head),
    })
  }
  scored.sort((a, b) => b.time - a.time || a.distance - b.distance || a.ref.localeCompare(b.ref))
  return scored[0] ?? null
}

export async function resolveBase(
  cwd: string,
  spec: BaseSpec,
  head = 'HEAD',
): Promise<ResolvedBase> {
  const root = await getRepoRoot(cwd)
  const headSha = await revParse(root, head)
  if (!headSha) {
    throw new DiffCovError(`Cannot resolve revision ${head}.`, 'BAD_HEAD')
  }

  if (spec !== 'auto' && spec !== 'new') {
    if (!(await refExists(root, spec))) {
      throw new DiffCovError(
        `Base ref ${spec} does not exist locally. Run git fetch, or pass an existing ref.`,
        'BASE_NOT_FOUND',
      )
    }
    const base = await mergeBase(root, spec, headSha)
    if (!base) {
      throw new DiffCovError(
        `No merge base between ${spec} and ${head}.`,
        'NO_MERGE_BASE',
      )
    }
    return {
      mode: 'branch',
      ref: spec,
      mergeBase: base,
      head: headSha,
      distance: await countCommits(root, base, headSha),
      warnings: [],
    }
  }

  if (await isShallow(root)) {
    throw new DiffCovError(
      'This is a shallow clone; base resolution needs full history. Fetch with depth 0.',
      'SHALLOW_CLONE',
    )
  }

  const refs = await listRemoteRefs(root)
  if (!refs.length) {
    throw new DiffCovError(
      'No remote-tracking refs found. Add a remote and fetch, or pass an explicit base.',
      'NO_REMOTE_REFS',
    )
  }

  const currentBranch = await getCurrentBranch(root)
  const trunk = refs.filter((ref) => isTrunkRef(ref.name, currentBranch))
  const candidates = spec === 'auto' && trunk.length > 0 ? trunk : refs
  const best = await closestBase(root, headSha, candidates)
  if (!best) {
    throw new DiffCovError(
      'No remote ref shares history with the current branch. Fetch the remote or pass an explicit base.',
      'NO_COMMON_HISTORY',
    )
  }

  const warnings: string[] = []
  if (spec === 'auto' && trunk.length === 0) {
    warnings.push(`No trunk branch matched; using ${best.ref} as the base.`)
  }
  if (spec === 'new' && best.ref) {
    warnings.push(`new mode compared against ${best.ref} (the closest remote ancestor).`)
  }

  return {
    mode: spec === 'auto' ? 'auto' : 'new',
    ref: best.ref,
    mergeBase: best.mergeBase,
    head: headSha,
    distance: best.distance,
    warnings,
  }
}

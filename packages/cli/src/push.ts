export interface PushRef {
  localRef: string
  localSha: string
  remoteRef: string
  remoteSha: string
}

export function parsePushRefs(input: string): PushRef[] {
  const refs: PushRef[] = []
  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [localRef, localSha, remoteRef, remoteSha] = trimmed.split(/\s+/)
    if (!localRef || !localSha || !remoteRef || !remoteSha) continue
    refs.push({ localRef, localSha, remoteRef, remoteSha })
  }
  return refs
}

export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  let input = ''
  for await (const chunk of process.stdin) {
    input += chunk
  }
  return input
}

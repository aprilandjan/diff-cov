import { describe, expect, it } from 'vitest'
import { parsePushRefs } from '../src/push.js'

describe('parsePushRefs', () => {
  it('parses the four fields git writes to a pre-push hook', () => {
    const input = [
      'refs/heads/main aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa refs/heads/main bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'refs/heads/feature cccccccccccccccccccccccccccccccccccccccc refs/heads/feature 0000000000000000000000000000000000000000',
      '',
    ].join('\n')

    expect(parsePushRefs(input)).toEqual([
      {
        localRef: 'refs/heads/main',
        localSha: 'a'.repeat(40),
        remoteRef: 'refs/heads/main',
        remoteSha: 'b'.repeat(40),
      },
      {
        localRef: 'refs/heads/feature',
        localSha: 'c'.repeat(40),
        remoteRef: 'refs/heads/feature',
        remoteSha: '0'.repeat(40),
      },
    ])
  })

  it('ignores blank and malformed lines', () => {
    expect(parsePushRefs('\nnot enough fields\n')).toEqual([])
  })
})

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCobertura } from '../src/coverage/cobertura.js'

describe('parseCobertura', () => {
  it('reads line hits and resolves source roots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diff-cov-cobertura-'))
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'src', 'a.ts'), 'x\n', 'utf8')

    const xml = `<?xml version="1.0"?>
<coverage>
  <sources><source>.</source></sources>
  <packages>
    <package name="src">
      <classes>
        <class name="A" filename="src/a.ts">
          <lines>
            <line number="1" hits="2"/>
            <line number="2" hits="0"/>
          </lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>`

    const source = parseCobertura(xml, { root, reportDir: root })
    expect(source.files()).toEqual(['src/a.ts'])
    expect(source.lineHits('src/a.ts')).toEqual({ 1: 2, 2: 0 })
  })
})

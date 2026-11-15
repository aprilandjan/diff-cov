import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node20',
  define: {
    __DIFF_COV_VERSION__: JSON.stringify(pkg.version),
  },
})

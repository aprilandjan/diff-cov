import { Command, Option } from 'commander'
import { exitCodeFor, run, type CliOptions } from './run.js'

declare const __DIFF_COV_VERSION__: string

function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

function parseNumber(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`Expected a number, got ${value}`)
  return parsed
}

export function createProgram(): Command {
  const program = new Command()
  program
    .name('diff-cov')
    .description('Line coverage of the lines a git diff adds or modifies.')
    .version(__DIFF_COV_VERSION__)
    .option('--cwd <dir>', 'working directory', process.cwd())
    .option('--config <path>', 'config file')
    .option('--base <ref>', 'base ref, "auto" (default) or "stable"')
    .addOption(new Option('--scope <scope>', 'diff scope').choices(['committed', 'worktree']))
    .option('--coverage <path>', 'coverage report path or glob (repeatable)', collect, [])
    .option('--threshold <percent>', 'total diff coverage threshold', parseNumber)
    .option('--per-file-threshold <percent>', 'per-file diff coverage threshold', parseNumber)
    .addOption(
      new Option('--per-file <percent>', 'deprecated alias for --per-file-threshold')
        .argParser(parseNumber)
        .hideHelp(),
    )
    .option('--allow-stale', 'accept a coverage report older than the changed files')
    .option('--advisory', 'report threshold failures without failing the process')
    .option('--json', 'print JSON instead of text')
    .option('--report <path>', 'write a JSON report')
    .option('--no-color', 'disable color')
    .option('--verbose', 'print extra diagnostics')
  return program
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = createProgram()
  await program.parseAsync(argv)
  const options = program.opts<CliOptions>()
  try {
    process.exitCode = await run(options)
  } catch (error) {
    const code = exitCodeFor(error)
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`diff-cov: ${message}\n`)
    if (options.verbose && error instanceof Error && error.stack) {
      process.stderr.write(`${error.stack}\n`)
    }
    process.exitCode = code
  }
}

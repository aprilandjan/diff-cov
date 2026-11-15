export class DiffCovError extends Error {
  readonly code: string
  readonly details?: unknown

  constructor(message: string, code: string, details?: unknown) {
    super(message)
    this.name = 'DiffCovError'
    this.code = code
    this.details = details
  }
}

export class MissingCoverageError extends DiffCovError {
  readonly files: string[]

  constructor(files: string[]) {
    super(
      `Coverage report has no entry for ${files.length} changed source file(s): ${files.join(', ')}. ` +
        'Include them in the coverage run (for Vitest set coverage.include) or change `missing` policy.',
      'MISSING_COVERAGE',
      { files },
    )
    this.name = 'MissingCoverageError'
    this.files = files
  }
}

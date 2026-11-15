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

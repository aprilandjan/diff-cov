# Contributing

## Requirements

- Node.js 22 or 24
- pnpm 10

## Setup

```bash
pnpm install
pnpm build
pnpm test
```

## Checks

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

CI runs the same checks on Node 22 and 24, plus lcov and Cobertura smoke tests
against `examples/vitest-app`.

## Git hooks

Husky installs the hooks on `pnpm install`:

- `pre-commit` runs `lint-staged` (Prettier on staged files).
- `commit-msg` runs commitlint with Conventional Commits.
- `pre-push` runs typecheck and tests.

## Commits

Use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`,
`chore:`, `ci:`. A breaking change uses `!` and a `BREAKING CHANGE:` footer.

## Changesets

Add a changeset when a change affects the behavior of a published package
(`packages/core`, `packages/cli`, or `packages/vitest`):

```bash
pnpm changeset
```

Choose the packages and the bump type (`patch`, `minor`, `major`), then commit
the generated `.changeset/*.md` file with the PR.

Docs, CI, tests, and internal refactors do not need a changeset. Do not edit
package versions or publish manually; the release workflow handles that.

## Pull requests

- Keep the change focused.
- Add or update tests for behavior changes.
- Run `pnpm format:check`, `pnpm typecheck`, and `pnpm test`.
- Add a changeset when the change affects a published package.

## Maintainers

Release and trusted publishing notes: [docs/releasing.md](docs/releasing.md).

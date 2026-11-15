# Releasing

Maintainer notes. This is not part of the user documentation.

The first `0.1.0` publish was manual. Subsequent releases use changesets and npm
trusted publishing; no long-lived `NPM_TOKEN` is involved.

## Prerequisites

- The `diff-cov` npm org, with owner access.
- For each package on npmjs.com: **Settings → Trusted Publisher → GitHub
  Actions**, repository `aprilandjan/diff-cov`, workflow filename `release.yml`,
  and **Allow npm publish**. New connections default to `npm stage publish`
  only; direct publishing must be enabled explicitly.
- In the GitHub repository: **Settings → Actions → General → Allow GitHub
  Actions to create and approve pull requests**.

A new trusted publisher connection must complete its first successful publish
within two days, so create it when a version PR is ready to merge.

## Flow

1. A PR with a changeset is merged to `main`.
2. The Release workflow creates or updates the **Version Packages** PR.
3. The PR's CI run is usually `action_required` because the PR is created by
   `github-actions[bot]`; approve it once.
4. Merge the Version Packages PR. The Release workflow runs `pnpm release`,
   publishes with OIDC provenance, creates git tags, and creates GitHub
   releases.

## Notes

- Do not publish manually while changesets is active; it desynchronizes the
  version history.
- Trusted publishing requires npm CLI 11.5.1+ and Node 22.14+ on the runner.
- If a publish fails with `E422` about `repository.url`, check that each
  package's `repository.url` matches the GitHub repository.

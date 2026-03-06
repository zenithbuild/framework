# Contributing

This repository contains the Zenith framework monorepo. Governance and release rules are canonical at the root, and framework packages and apps live under `packages/` and `apps/`.

## Branch Model

- Branch from `train` for all contributor work.
- Open pull requests into `train` only.
- `beta` is maintainers-only and reserved for internal integration work.
- `master` is the stable branch and only accepts maintainer PRs from `train` after release validation.
- Do not push directly to `train`, `master`, or `beta`.

## Required For Every PR

- Add a bullet to [CHANGELOG.md](./CHANGELOG.md) under `## [Unreleased]`.
- Keep governance, release policy, and contract docs aligned with implementation changes.
- Preserve package names and the lockstep train version policy unless a repo-level versioning decision changes it.
- Keep CI unified through the single root gate: `bun run ci`.

## Current Constraints

- Keep plugins and language tooling out of this repository for now.
- Keep framework release channel selection on npm dist-tags, not semver suffixes.
- Use OIDC-only trusted publishing for the normal npm publish path.

## Not In Scope

- Importing plugin repositories.
- Importing `zenith-language` or `zenith-language-server`.
- Rewriting source repos outside this monorepo as part of monorepo-only fixes.

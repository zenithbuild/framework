# Release Policy

Zenith uses three protected branches with branch-specific semver lines. Channel selection is determined by the tag shape and the branch that contains the tagged commit.

## Branches

- `beta`: internal integration branch for maintainers. Optional beta publishes are pre-release only.
- `train`: public integration branch. Contributor PRs land here first.
- `master`: stable branch. Only maintainers merge validated train work into `master`.

## Allowed Merges

- External contributors: `feature/* -> train` by pull request.
- Maintainers: `beta -> train` by pull request.
- Maintainers: `train -> master` by pull request.
- Direct pushes to `beta`, `train`, and `master` should be blocked by branch protection.

## Release Contract

- `vX.Y.Z-beta.N` tags publish to npm dist-tag `beta` and must come from `beta`.
- `vX.Y.Z-train.N` and `vX.Y.Z-rc.N` tags publish to npm dist-tag `train` and must come from `train`.
- `vX.Y.Z` tags publish to npm dist-tag `latest` and must come from `master`.
- Stable releases are distinct semver publishes. `v0.7.1-train.0` and `v0.7.1` are different releases; `latest` is never moved by re-tagging or by post-publish dist-tag promotion.

## Published Package Ownership

- Framework releases publish `@zenithbuild/bundler`, `@zenithbuild/cli`, `@zenithbuild/compiler`, `@zenithbuild/core`, `@zenithbuild/extension-registry`, `@zenithbuild/router`, `@zenithbuild/runtime`, and the matching native platform packages.
- `@zenithbuild/language` and `@zenithbuild/language-server` are standalone-release-owned. The framework repo may keep private source mirrors for CI and integration checks, but the framework publish workflow must not publish those package names.

## Versioning Rules

- `TRAIN_VERSION` remains the source of truth for the version being cut from the current branch.
- On `train`, `TRAIN_VERSION` must be a prerelease version such as `0.7.1-train.0` or `0.7.1-rc.0`.
- On `master`, `TRAIN_VERSION` must be the stable version such as `0.7.1`.
- The pushed git tag must exactly match `TRAIN_VERSION` with a leading `v`.

## Release Notes Contract

- Every pull request into `train` must add at least one bullet to [CHANGELOG.md](../../CHANGELOG.md) under `## [Unreleased]`.
- `Unreleased` is the source of truth for the next train cut.
- Before any tagged release, move the relevant `Unreleased` bullets into a versioned section matching `TRAIN_VERSION`.
- Stable releases must also add or update the matching docs-side markdown entry under [docs/changelog](../changelog/) before the release is considered complete.

## Release Flow

1. Stabilize `train`.
2. Bump `TRAIN_VERSION` on `train` to the next prerelease version and cut the matching changelog section.
3. Push `vX.Y.Z-train.N` or `vX.Y.Z-rc.N` from a commit contained in `train`.
4. [publish.yml](../../.github/workflows/publish.yml) runs CI, publishes package tarballs to npm dist-tag `train`, and then [release.yml](../../.github/workflows/release.yml) creates the GitHub release for that tag.
5. After train validation, merge `train` into `master`.
6. On `master`, bump `TRAIN_VERSION` to the stable version, finalize the stable changelog/docs release notes, and push `vX.Y.Z`.
7. The stable tag publishes directly to npm dist-tag `latest` from `master` and creates the GitHub release for the stable version.

## Pipeline Policy

- Pull request and reusable CI workflows run with read-only repository permissions and no npm publish credentials.
- Publishing is OIDC-only via [publish.yml](../../.github/workflows/publish.yml) in the `npm-release` environment.
- OIDC token permission is granted only on npm publish jobs, not on preflight, verification, or release metadata jobs.
- The standard publish path must not use `NPM_TOKEN`, `NODE_AUTH_TOKEN`, token-written `.npmrc` auth, or a separate latest-promotion token flow.
- Tag publishing is guarded twice before npm publish begins:
  - the pushed tag must match `TRAIN_VERSION` after removing the leading `v`
  - the tagged commit must be contained in the correct branch for that tag kind (`beta`, `train`, or `master`)
- The CI gate retries once (`bun run ci`) to reduce flaky failures. Publish never retries automatically.
- [release.yml](../../.github/workflows/release.yml) runs only after publish succeeds and consumes the verified publish metadata artifacts from that successful run.
- [bootstrap-platform-packages.yml](../../.github/workflows/bootstrap-platform-packages.yml) remains manual-only for bootstrapping brand-new npm package names before trusted publishing can take over.

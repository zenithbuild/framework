# Release Policy

Zenith uses a three-branch release train with shared package versions across `beta`, `train`, and `master`. Channel selection happens through npm dist-tags, not semver suffixes.

## Branches

- `beta`: internal-only integration branch for maintainers. Optional `beta` publishes are internal-only.
- `train`: public contribution and integration branch. All contributor PRs land here first.
- `master`: stable branch. Only maintainers merge `train` into `master` after rigorous testing.

## Allowed Merges

- External contributors: `feature/* -> train` by pull request.
- Maintainers: `beta -> train` by pull request.
- Maintainers: `train -> master` by pull request.
- Direct pushes to `beta`, `train`, and `master` are disallowed by policy and should be blocked with GitHub branch protection.

## Release Notes Contract

- Every pull request into `train` must add at least one bullet to [CHANGELOG.md](../../CHANGELOG.md) under `## [Unreleased]`.
- `Unreleased` is the source of truth for the next train cut.
- Stable releases must have a matching version section in `CHANGELOG.md` before GitHub Release creation runs.

## Release Cut

1. Stabilize `train` and move `CHANGELOG.md` `Unreleased` entries into a new version section matching `TRAIN_VERSION`.
2. Create and push tag `v<TRAIN_VERSION>` from a commit contained in `train`.
3. GitHub Actions runs `CI`, then npm publish, then GitHub Release.
4. The tag-driven publish workflow publishes the framework packages to npm dist-tag `train`.
5. After publish succeeds and validation passes, open a maintainer PR from `train` to `master`.
6. After the `train -> master` merge is validated, promote the already-published version from dist-tag `train` to dist-tag `latest`.

## Dist-Tag Mapping

- `v*` tag pushed from `train`: publish framework packages on dist-tag `train`.
- `master`: never publishes a separate semver line; it promotes the same package version to dist-tag `latest` after the merge.
- `beta`: optional internal-only publishes use dist-tag `beta`.

## Pipeline Policy

- Normal framework publishing is OIDC-only via [publish.yml](../../.github/workflows/publish.yml) in the `npm-release` environment.
- The standard publish path must not use `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or token-written `.npmrc` auth.
- Tag publishing is guarded twice before npm publish begins:
  - the pushed tag must match `TRAIN_VERSION` after removing the leading `v`
  - the tagged commit must be contained in `origin/train`
- The CI gate retries once (`bun run ci`) to reduce flaky failures. Publish never retries automatically.
- GitHub Release creation runs only after publish succeeds.
- `.github/workflows/bootstrap-platform-packages.yml` remains manual-only for bootstrapping brand-new package names.

## Latest Promotion

Promote `latest` only after the `train -> master` merge has been validated.

Minimum promotion:

```sh
npm dist-tag add @zenithbuild/core@0.6.13 latest
npm dist-tag add @zenithbuild/cli@0.6.13 latest
```

Recommended full alignment:

```sh
npm dist-tag add @zenithbuild/core@0.6.13 latest
npm dist-tag add @zenithbuild/cli@0.6.13 latest
npm dist-tag add @zenithbuild/runtime@0.6.13 latest
npm dist-tag add @zenithbuild/router@0.6.13 latest
npm dist-tag add @zenithbuild/bundler@0.6.13 latest
npm dist-tag add @zenithbuild/compiler@0.6.13 latest
```

npm Trusted Publishing currently covers `npm publish`, not `npm dist-tag add`, so `promote-latest.yml` is an approval-gated stub and the actual promotion step remains a manual authenticated maintainer action.

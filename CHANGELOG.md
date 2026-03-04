# Changelog

All notable changes to the Zenith core release train are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this repository tracks the lockstep train in [`TRAIN_VERSION`](./TRAIN_VERSION).

## [Unreleased]

### Changed

- No unreleased entries yet.

## [0.6.11] - 2026-03-04

### Changed

- Fixed the `@zenithbuild/bundler` publish contract so the npm tarball ships `scripts/render-assets.mjs`, and the native bundler now resolves that bridge from installed `node_modules` layouts instead of only repo checkouts.
- Added a bundler `npm pack --dry-run` regression gate so CI fails if runtime bridge scripts or `dist/**` drop out of the published tarball again.
- Documented the post-publish dist-tag promotion sequence for `latest` so public installs stay on a coherent train while `train` remains available as the safety channel.

## [0.6.10] - 2026-03-04

### Changed

- Fixed cross-OS fresh installs by moving `@zenithbuild/compiler` to platform-specific native packages, matching the bundler distribution model and keeping the meta package binary-free.
- Updated CLI toolchain resolution to prefer installed compiler and bundler platform packages, while treating wrong-OS native binaries as fallthrough candidates instead of hard failures.
- Fixed `zenith-bundler --version` to report the lockstep npm train version when builds inject `ZENITH_TRAIN_VERSION`, with the Cargo crate version kept as the deterministic fallback.
- Expanded the cross-OS smoke and toolchain resolution tests so wrong-format native binaries and workspace fallback leaks fail CI before release.

## [0.6.9] - 2026-03-03

### Changed

- Fixed the `@zenithbuild/bundler` meta package dependency surface so fresh installs can resolve runtime and router assets correctly while still using platform-specific native bundler packages.

## [0.6.8] - 2026-03-03

### Changed

- Fixed cross-OS `@zenithbuild/bundler` installs by moving native bundler delivery to platform-specific packages, with the `@zenithbuild/bundler` meta package resolving the correct installed binary for the active OS and CPU.

## [0.6.7] - 2026-03-03

### Changed

- TypeScript strictness ramp (Level 1) for `@zenithbuild/router` and `@zenithbuild/core`, plus a partial Level 1 ramp for TS leaf modules in `@zenithbuild/runtime` and `@zenithbuild/cli`, with no public API changes.

## [0.6.6] - 2026-03-02

### Added

- A single monorepo CI gate via `bun run ci`, including the Playwright smoke gate for `apps/smoke-test`.
- CLI version mismatch detection that warns when installed `@zenithbuild/*` packages or the bundler binary drift from the active train and prints a fix command.

### Changed

- Internal Tailwind v4 compilation is covered in dev/build by the bundler contract tests, including hard failures for unresolved raw `tailwindcss` imports in emitted CSS.
- The dev-server HMR v1 contract was hardened around the CSS endpoint and update sequencing.
- The compiler JSON envelope remains additive with `schemaVersion: 1`, stable `warnings`, and always-present `ref_bindings` for downstream consumers.
- The imported Zenith docs tree now lives at root `/docs` as the documentation source of truth with no content dropped during the move.

## [0.6.5] - 2026-03-01

### Added

- A single monorepo CI gate via `bun run ci`, including the Playwright smoke gate for `apps/smoke-test`.
- CLI version mismatch detection that warns when installed `@zenithbuild/*` packages or the bundler binary drift from the active train and prints a fix command.

### Changed

- Internal Tailwind v4 compilation is covered by the bundler contract tests, including hard failures for unresolved raw `tailwindcss` imports in emitted CSS.
- The dev-server HMR v1 contract was hardened around the CSS endpoint and update sequencing.
- The compiler JSON envelope remains additive with `schemaVersion: 1`, stable `warnings`, and always-present `ref_bindings` for downstream consumers.
- The imported Zenith docs tree now lives at root `/docs` as the documentation source of truth with no content dropped during the move.

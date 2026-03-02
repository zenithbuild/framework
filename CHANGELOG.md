# Changelog

All notable changes to the Zenith core release train are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this repository tracks the lockstep train in [`TRAIN_VERSION`](./TRAIN_VERSION).

## [Unreleased]

### Changed

- No unreleased entries yet.

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

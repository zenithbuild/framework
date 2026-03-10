# Changelog

All notable changes to the Zenith core release train are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this repository tracks the lockstep train in [`TRAIN_VERSION`](./TRAIN_VERSION).

## [Unreleased]

### Changed

- Fixed slot-scoped owner attribution so slotted refs/state/signals keep parent scope through component occurrence collection and emitted child props.
- Separated compiler ref markers from dynamic attr markers (`data-zx-ref` vs `data-zx-*`) to prevent same-node marker collisions during hydration.
- Fixed runtime SVG `class` bindings to apply through SVG-safe attribute writes while preserving existing HTML `class` behavior.
- Fixed CLI post-compiler expression rewriting so mixed reactive/local-const component expressions stay fully rewritten in final built binding functions.
- Added focused regression coverage for slot-scope ownership, marker namespace separation, SVG class binding, component-expression rewriting, and final props-prelude ref emission.

## [0.6.17] - 2026-03-06

### Changed

- Fixed train publish metadata checks to ignore `NPM_CONFIG_TAG=train` during npm registry lookups, preventing false platform bootstrap failures for existing package names.

## [0.6.16] - 2026-03-06

### Changed

- Editor tooling: zenith-language + language-server now ship with canonical TS tokenization, compiler diagnostics, hovers, and completions.
- Documented the `beta` / `train` / `master` release model, added tag-to-branch publish guards, and moved framework publishes to the tag-driven `CI -> npm publish -> GitHub Release` workflow with OIDC-only normal publishing.
- Imported `@zenithbuild/language` and `@zenithbuild/language-server` into the monorepo, aligned `.zen` editor tooling to the canonical Zenith grammar/LSP surface, and added CI coverage for grammar embedding, hover docs, completions, and ZEN-DOM diagnostics.

## [0.6.13] - 2026-03-05

### Changed

- Fixed vendor bundling classification so `@/` path-alias imports are treated as project modules instead of external npm packages, preventing initial build failures caused by `.zen` modules being pulled into vendor entrypoints.
- Added bundler regression coverage to lock the `@/` alias behavior in vendor external detection.
- Added missing runtime dependencies (`gsap`, `tailwind-merge`) to the site package so fresh installs do not fail on unresolved UI imports.

## [0.6.12] - 2026-03-04

### Changed

- Fixed function-prop transport for component callsites so parent-scope symbols are emitted through scoped/renamed bindings (no raw unscoped identifiers in emitted props objects).
- Added regression coverage for direct and multi-hop event-like handler props (`onClick`, `onKeydown`, `onInput`, `onSubmit`) plus non-function prop scoping transport.
- Fixed component tag parsing for inline prop function expressions (for example `onSubmit={(event) => submit(event)}`) so component expansion and prop lowering remain stable.
- Documented canonical handler-prop forwarding (`on:*` wiring in component markup) and tightened docs syntax gates to distinguish DOM `onClick=` misuse from valid component prop examples.

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

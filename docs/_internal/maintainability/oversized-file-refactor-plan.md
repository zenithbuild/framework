# Oversized File Refactor Plan

Issue: #48 / ZFW-26
Snapshot source: `origin/master` after Batch 12
Snapshot command: `node ./scripts/file-size-audit.mjs --allowlist docs/maintainability/file-size-allowlist.json --print-limit 300`

## Purpose

This is a planning document only. It identifies existing oversized files and safe future split boundaries so later PRs can reduce file size without mixing refactors with behavior changes.

Do not use this plan as approval to change runtime, compiler, bundler, CLI, router, or docs behavior. Each split should be mechanical, behavior-preserving, and separately reviewed.

## Current Audit Snapshot

The current file-size audit reports:

- scanned files: 789
- `<=500`: 765
- `501-800`: 15
- `801-1200`: 8
- `1201-2000`: 1
- over preferred limit: 24
- allowlisted over limit: 1
- non-allowlisted violations: 23

The audit currently scans source-like files and excludes generated/public docs directories. The archived compiler V1 snapshot was removed from the repository surface, so it is no longer part of active refactor debt. The audit does not scan Markdown docs, so long docs pages are listed separately below.

Previously named issue targets have changed:

| Old target | Current state | Action |
| --- | ---: | --- |
| `packages/compiler/zenith_compiler/src/script_transform.rs` | 483 lines | Below limit. Monitor only. |
| `packages/bundler/src/main.rs` | 762 lines | Still oversized and allowlisted. Split first. |
| `packages/runtime/tests/integration.spec.js` | 940 lines | Still oversized. Split by behavior area. |
| `packages/cli/tests/build.spec.js` | missing | Already removed or split. No action. |
| `docs/documentation/reactivity/overlay-sheet-pattern.md` | 1121 lines | Still long. Split docs page separately. |

## Refactor Priorities

### 1. Active bundler source

Files:

- `packages/bundler/src/main.rs` - 762 lines, allowlisted
- `packages/bundler/src/image_materialization.rs` - 674 lines
- `packages/bundler/src/utils.rs` - 529 lines
- `packages/bundler/src/ts_strip.rs` - 536 lines

Why oversized:

- `main.rs` still owns process entry, CLI orchestration, build pipeline sequencing, output-mode coordination, and test fixtures.
- `image_materialization.rs` combines config parsing, source normalization, HTML rendering, local image models, remote image models, and pattern matching.
- `utils.rs` mixes virtual IDs, JS expression emission, validation, CSS helpers, hashing, and import rewriting.
- `ts_strip.rs` includes production logic and its large parser-like test suite in one file.

Safe split boundaries:

- Move `main.rs` orchestration helpers into small modules by pipeline phase: input loading, page compilation, asset emission, manifest emission, and finalization.
- Split image materialization into config/model parsing, URL/path normalization, HTML rendering, local-image planning, remote-image planning, and remote pattern matching.
- Split `utils.rs` into virtual module IDs, JS expression emission, validation, CSS processing, hashing, and import rewriting.
- Move `ts_strip.rs` tests into a dedicated integration test file before splitting implementation helpers.

Do not touch casually:

- compiler JSON boundary handling
- runtime table serialization
- image materialization output shape
- snapshot or golden output unless byte changes are intentional and reviewed

Minimum checks after each split:

- `cargo test --manifest-path packages/bundler/Cargo.toml`
- `bun run --cwd packages/bundler contract:deps`
- `bun run --cwd packages/bundler contract:scan`
- `bun run --cwd packages/bundler contract:imports`
- relevant CLI build tests if emitted assets or image materialization are touched

### 2. Runtime hydration and DOM tests

Files:

- `packages/runtime/tests/integration.spec.js` - 940 lines
- `packages/runtime/tests/dom-binding.spec.js` - 806 lines

Why oversized:

- `integration.spec.js` combines API surface locks, hydration bootstrap, params/SSR resolution, component bootstrap, signal props, payload freezing, ref readiness, mount cleanup, fragment safety, deterministic hydration, and source guardrails.
- `dom-binding.spec.js` combines marker table validation, text and attribute binding, fragment rendering, runtime diagnostics overlay, member resolution, unsafe member access, and unresolved expression behavior.

Safe split boundaries:

- Split API export locks and source guardrails into small contract files.
- Split hydration payload immutability and descriptor validation from component bootstrap tests.
- Split fragment rendering and unsafe HTML tests from ordinary marker binding tests.
- Split diagnostics overlay tests from marker/member resolution tests.

Do not touch casually:

- runtime error codes and diagnostics shape
- payload table freezing behavior
- component prop descriptor schema
- fragment safety assertions

Minimum checks after each split:

- `bun run --cwd packages/runtime test`
- `bun run --cwd packages/runtime typecheck`
- relevant CLI hydration/build tests if compiler or bundler payloads are touched

### 3. CLI dev, routing, and drift tests

Files:

- `packages/cli/tests/dev.spec.js` - 908 lines
- `packages/cli/tests/server-routing-contract.spec.js` - 735 lines
- `packages/cli/tests/drift-gates.spec.js` - 521 lines

Why oversized:

- `dev.spec.js` mixes dev server startup, pending builds, route 404s, HMR endpoints, CSS rebuilds, Tailwind refresh, SSE recovery, preview server behavior, and CLI source guardrails.
- `server-routing-contract.spec.js` combines dev/preview route precedence, deny semantics, adjacent guard/load, action rerender, resource routes, multipart actions, sanitization, and origin reconstruction.
- `drift-gates.spec.js` combines release train version locks, framework import bans, SSR channel locks, runtime primitive scans, docs syntax locks, create-zenith scaffold checks, and route-protection docs truth.

Safe split boundaries:

- Split dev server tests into startup/routing, HMR/SSE endpoints, CSS rebuild/Tailwind, and preview-server suites.
- Split server routing tests by request class: direct HTML routing, guard/load/action, resource routes, multipart actions, error sanitization, and origin handling.
- Split drift gates by owner: release/version, runtime/router source scans, docs syntax truth, scaffold release gate, and generated types.

Do not touch casually:

- dev server request sequencing
- preview parity fixtures
- fixture setup helpers shared by many tests
- release and docs drift gate assertions

Minimum checks after each split:

- `bun run --cwd packages/cli test -- tests/<new-suite>.spec.js`
- `bun run --cwd packages/cli test`
- `bash ./scripts/ci-core.sh`

### 4. Router and generated artifacts

Files:

- `packages/router/tests/fixtures/router-template.golden.js` - 1298 lines
- `packages/language/out/server.mjs` - 932 lines

Why oversized:

- `router-template.golden.js` is a full emitted template fixture.
- `packages/language/out/server.mjs` is a bundled generated artifact.

Safe split boundaries:

- Prefer regenerating or snapshotting smaller focused router template sections instead of manually editing the golden file.
- Do not split generated language output by hand. Reduce the source package if needed, then rebuild output.

Do not touch casually:

- generated output without source changes
- full-template golden expectations
- package output files that must match build scripts

Minimum checks after each split:

- `bun run --cwd packages/router test`
- `bun run --cwd packages/language build && bun run --cwd packages/language test`
- `bun run --cwd packages/language-server test` if language server source changes

### 5. Bundler tests and docs/site scripts

Files:

- `packages/bundler/tests/css_framework_contract.rs` - 828 lines
- `docs/scripts/generate-ai-endpoints.mjs` - 886 lines
- `apps/benchmarks/scripts/run-bundle-analysis.mjs` - 613 lines
- `site/src/server/documentationSource.ts` - 573 lines
- `site/scripts/zenith-workspace.mjs` - 541 lines

Why oversized:

- CSS framework tests combine import policy, path security, Tailwind entry compilation, and CSS merge determinism.
- AI endpoint generation combines frontmatter parsing, doc/blog discovery, category building, nav generation, RSS, llms text, and output drift checks.
- Benchmark analysis combines asset discovery, source analysis, contributor ranking, directory stats, and report writing.
- Site documentation source combines local AI metadata loading, Directus query mapping, navigation grouping, and lookup normalization.
- Site workspace wrapper combines binary resolution, public asset sync, dev-state polling, and CLI spawning.

Safe split boundaries:

- Split bundler CSS tests by policy, local entry compilation, and deterministic merge behavior.
- Split AI endpoint generation into frontmatter parsing, content discovery, category/nav building, output writers, and drift comparison.
- Split benchmark analysis into asset readers, source analyzers, contributor summaries, and report assembly.
- Split site documentation source into local loader, Directus mapper, grouping/navigation helpers, and lookup helpers.
- Split site workspace wrapper into binary resolution, public asset sync, dev-state polling, and process spawning.

Minimum checks after each split:

- `cargo test --manifest-path packages/bundler/Cargo.toml --test css_framework_contract`
- `bun run --cwd docs docs:gate`
- `bun run --cwd docs test`
- `bun run --cwd apps/benchmarks run:bundle-analysis` when benchmark script behavior changes
- `bun run --cwd site build`
- `bun run --cwd site test`

### 6. Site components

Files:

- `site/src/components/ui/ZenithLogo.zen` - 601 lines
- `site/src/components/ui/Navigation.zen` - 511 lines

Why oversized:

- `ZenithLogo.zen` likely contains large inline SVG/markup data.
- `Navigation.zen` mixes navigation state, markup, responsive behavior, and styling.

Safe split boundaries:

- Move static logo path data into a generated/static asset or a small dedicated data module if the framework supports the chosen import path.
- Split navigation into data, responsive state, menu section rendering, and visual wrapper components only if Zenith component boundaries remain explicit.

Do not touch casually:

- `.zen` event syntax
- direct DOM access rules
- Tailwind token usage
- existing visual behavior without browser verification

Minimum checks after each split:

- `bun run --cwd site build`
- `bun run --cwd site test`
- browser verification for any visual component split

### 7. Long reactivity documentation

File:

- `docs/documentation/reactivity/overlay-sheet-pattern.md` - 1121 lines

Why oversized:

- One page combines overlay contract, focus behavior, close semantics, accessible labeling, destructive and non-destructive wording, settings sheet structure, save/cancel semantics, styling, cleanup, and composition notes.

Safe split boundaries:

- Keep the core page as an overview and index.
- Split focused docs into: focus behavior, dismissal and close semantics, accessibility labeling, confirmation wording, settings sheet structure, save/cancel semantics, styling, and cleanup.
- Preserve existing canonical snippets and compile them before moving.

Minimum checks after each split:

- `bun run --cwd docs docs:gate`
- `bun run --cwd docs test`

### 8. Archived legacy bundler files

Files:

- `packages/bundler/_legacy_v1/src/spa-build.ts` - 932 lines
- `packages/bundler/_legacy_v1/src/bundle-generator.ts` - 854 lines
- `packages/bundler/_legacy_v1/src/ssg-build.ts` - 576 lines

Why oversized:

- These are archived legacy snapshots. They are not current public API and should not drive active refactor priorities.

Safe split boundaries:

- Do not refactor legacy files as normal product work.
- If audit noise becomes a problem, handle it as a guardrail calibration issue: either exclude archived `_legacy_v1` consistently or document an explicit allowlist rationale.

Minimum checks:

- No checks needed unless a separate approved change touches legacy files.

## Priority Order

1. `packages/bundler/src/main.rs` and `packages/bundler/src/image_materialization.rs`
2. Runtime test split: `integration.spec.js` and `dom-binding.spec.js`
3. CLI test split: `dev.spec.js`, `server-routing-contract.spec.js`, `drift-gates.spec.js`
4. Router golden and generated language output policy
5. Docs/site generation scripts
6. Long reactivity overlay/sheet docs
7. Site UI component splits
8. Archived legacy bundler files only if guardrail calibration is needed

## Future Guardrails

Do not add a noisy global gate that fails all known oversized files at once.

The existing audit already supports the preferred near-term guardrail:

```bash
node ./scripts/file-size-audit.mjs --allowlist docs/maintainability/file-size-allowlist.json --enforce --max-lines 500 --git-diff-base origin/master --print-limit 200
```

Future guardrail work should:

- keep touched-file enforcement as the default release gate
- require allowlist entries to have an owner or linked follow-up issue
- remove stale allowlist entries when files fall under 500 lines
- avoid counting generated artifacts and archived legacy snapshots as active refactor debt unless they are edited

## Proposed Follow-up Issues

Create follow-up issues only with concrete ownership and split boundaries:

1. #76: Split active bundler oversized source by pipeline and image materialization boundaries.
2. #77: Split runtime hydration and DOM binding oversized test suites.
3. #78: Split CLI dev, server-routing, and drift-gate oversized test suites.
4. #79: Define generated/golden artifact file-size policy for router and language outputs.
5. #80: Split docs/site generation scripts by parsing, loading, mapping, and output phases.
6. #81: Split `overlay-sheet-pattern.md` into smaller focused reactivity docs.
7. #82: Calibrate file-size audit handling for archived `_legacy_v1` bundler files.

Do not create a vague "make files smaller" issue. Each follow-up must list target files, split boundary, and required checks.

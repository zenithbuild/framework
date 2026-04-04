# Phase 19 — Router/Page Emitted Payload Compaction Tracker

Status: `Complete`

## Scope Locks
- Production emitted payload only (`OutputMode::Standard`).
- No dev-stable output shape changes.
- No public API or runtime/server contract changes.
- No router semantic behavior changes.
- Preserve determinism, zero-JS static omission, and local/hosted resource-streaming parity.
- Publication policy unchanged (Zenith determinism hard gate, external determinism caveat-only).

## Baseline
- Fixture: `interactive-filter`
- Runtime: `74,949 B`
- Router: `34,787 B`
- Page: `32,568 B`
- Core: `396 B`
- Total JS+inline: `142,700 B`

## Track A — Router Contributor Budgeting + Production Compaction
Implemented:
- Added router contributor accounting in benchmark artifacts:
  - `routerChunkBytes`
  - `routerContributors`
  - `routerCoverageBytes`
- Added deterministic production-only router minification in bundler emission path.
- Maintained unchanged dev-stable output behavior.

## Track B — Page Contributor Budgeting + Production Compaction
Implemented:
- Added page contributor accounting in benchmark artifacts:
  - `pageChunkBytes`
  - `pageContributors`
  - `pageCoverageBytes`
- Added deterministic production-only page minification.
- Added production-only generated scoped identifier compaction for emitted page assets.
- Maintained unchanged dev-stable output behavior.

## Track C — Optional Subsystem / Helper Gating
Implemented:
- Router route-check scaffolding is now emit-gated by build signal (`routeCheck`):
  - disabled profile omits route-check fetch scaffold in emitted router bundle.
- Page route-html helper scaffold is emitted only when router mode is active.
- Non-router page param-resolver scaffold is emitted only when router mode is inactive.

## Revalidation Evidence
Contract/runtime:
- `packages/bundler`: `cargo test` (pass)
- `packages/router`: `npm run contract:template` (pass)
- `packages/runtime`: `npm test` (pass)

Parity suites:
- `packages/cli/tests/resource-streaming.spec.js` (pass)
- `packages/cli/tests/adapter-hosted-resource-parity.spec.js` (pass)
- `packages/cli/tests/adapter-platform-node-streaming.spec.js` (pass)

Determinism/publication:
- Baseline refresh run:
  - `node apps/benchmarks/scripts/run-determinism.mjs --framework zenith --profile publication --save-baseline --run-id phase19-det-refresh-zenith`
- Post-refresh deterministic verification:
  - `node apps/benchmarks/scripts/run-determinism.mjs --framework zenith --profile publication --run-id phase19-det-post-refresh-zenith` (pass)
- Zenith publication-profile matrix:
  - `node apps/benchmarks/scripts/run-matrix.mjs --framework zenith --profile publication --run-id phase19-publication-matrix-zenith` (pass)
- Bundle-analysis publication artifact:
  - `node apps/benchmarks/scripts/run-bundle-analysis.mjs --framework zenith --profile publication --run-id phase19-bundle-analysis-zenith-r2` (pass)
  - Includes zero-JS static verification for `static-marketing` (pass).

## Outcome
`interactive-filter` after Phase 19:
- Runtime: `74,949 B` (unchanged)
- Router: `28,502 B` (`-6,285 B`)
- Page: `24,759 B` (`-7,809 B`)
- Core: `396 B` (unchanged)
- Total JS+inline: `128,606 B` (`-14,094 B`)

Gate result:
- Combined router+page reduction target (`10–15 KB`) met: `14,094 B`.

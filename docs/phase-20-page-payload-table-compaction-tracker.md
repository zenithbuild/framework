# Phase 20 — Page Payload Table Compaction Tracker

Status: `Complete`

## Scope Locks
- Production-emitted payload only (`OutputMode::Standard`).
- No dev-stable output shape changes.
- No public API/runtime/server contract changes.
- `hydrate(...)` input remains canonical object tables.
- Preserve determinism, zero-JS static omission, and local/hosted resource-streaming parity.
- Publication policy unchanged (Zenith determinism hard gate, external determinism caveat-only).

## Baseline
- Fixture: `interactive-filter`
- Runtime: `74,949 B`
- Router: `28,502 B`
- Page: `24,759 B`
- Core: `396 B`
- Total JS+inline: `128,606 B`
- Key page tables:
  - `__zenith_expression_bindings`: `7,630 B`
  - `__zenith_markers`: `5,761 B`

## Track A — Table Budgeting + Source-Overhead Accounting
Implemented:
- Extended bundle-analysis reporting with page table budget fields:
  - `pageTableContributors`
  - `pageTableCoverageBytes`
  - `pageSourceOverhead`
- Added comparability note for table shape/source-overhead accounting in publication artifacts.

## Track B — Production-Only Sparse Table Encoding + Canonical Inflate
Implemented:
- Added production-only compact table emission for page payload:
  - `__zenith_payload_expression_rows`
  - `__zenith_payload_marker_rows`
  - `__zenith_payload_files`
- Added page-local deterministic inflate helpers that reconstruct canonical:
  - `__zenith_expression_bindings`
  - `__zenith_markers`
- Kept dev-stable emitted page output unchanged.

## Track C — Revalidation
Contract/runtime:
- `cargo test --manifest-path packages/bundler/Cargo.toml` (pass)
- `npm run test --workspace @zenithbuild/runtime` (pass)
- `npm run contract:template --workspace @zenithbuild/router` (pass)

Parity suites:
- `npm run test --workspace @zenithbuild/cli -- tests/resource-streaming.spec.js tests/adapter-hosted-resource-parity.spec.js tests/adapter-platform-node-streaming.spec.js` (pass)

Determinism/publication:
- `node apps/benchmarks/scripts/run-determinism.mjs --framework zenith --profile publication --save-baseline --run-id phase20-det-refresh-zenith-r2`
  - baseline refresh step emitted expected baseline-drift diagnostics and wrote refreshed baselines
- `node apps/benchmarks/scripts/run-determinism.mjs --framework zenith --profile publication --run-id phase20-det-post-refresh-zenith-r2` (pass)
- `node apps/benchmarks/scripts/run-matrix.mjs --framework zenith --profile publication --run-id phase20-publication-matrix-zenith-r3` (pass)
  - publication assessment: `publicationStatus = ready`

Zero-JS static:
- Verified in bundle-analysis within matrix run:
  - `static-marketing`: `totalJsPlusInlineBytes = 0`, `jsCount = 0`, no scripts/inline scripts.

## Outcome
`interactive-filter` after Phase 20:
- Runtime: `74,949 B` (unchanged)
- Router: `28,502 B` (unchanged)
- Page: `15,733 B` (`-9,026 B`)
- Core: `396 B` (unchanged)
- Total JS+inline: `119,580 B` (`-9,026 B`)

Target gate:
- Page reduction target (`5–8 KB`) exceeded: `9,026 B`.

Table-shape shift (interactive-filter, publication):
- Before:
  - `page-table:__zenith_expression_bindings` `7,630 B`
  - `page-table:__zenith_markers` `5,761 B`
- After:
  - `page-table:__zenith_payload_expression_rows` `1,357 B`
  - `page-table:__zenith_payload_marker_rows` `1,320 B`
  - `page-table:__zenith_payload_files` `155 B`
  - canonical inflated tables remain as small glue:
    - `page-table:__zenith_expression_bindings` `105 B`
    - `page-table:__zenith_markers` `85 B`

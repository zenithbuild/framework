# Phase 22 — Page Helper / Function Scaffold Compaction Tracker

Status: `Complete (Optimization lane paused for release handoff)`

## Scope Locks
- Production-emitted page path only (`OutputMode::Standard`).
- No dev-stable output shape changes.
- No public API/runtime/server contract changes.
- Preserve canonical `hydrate(...)` input tables.
- Preserve determinism, zero-JS static omission, and local/hosted streaming parity.
- Publication policy unchanged (Zenith determinism hard gate; external determinism caveat-only).

## Baseline (Publication, `wave3d-dev-build-session`)
- Fixture: `interactive-filter`
- Runtime: `74,949 B`
- Router: `28,502 B`
- Page: `15,733 B`
- Core: `396 B`
- Total JS+inline: `119,580 B`
- Publication quality: `29/29 passed`
- Zero-JS static: preserved (`static-marketing totalJsPlusInlineBytes = 0`)

## Target Contributors
- `page-fn:__zv5` (`8,246 B`)
- `page-fn:__zenith_inflate_marker_row` (`733 B`)
- `page-fn:__zenith_mount` (`733 B`)
- `page-fn:__zenith_apply_route_html` (`542 B`)
- `page-fn:__zenith_inflate_expression_row` (`540 B`)

## Track A — Helper Scaffold Compaction
Implemented:
- Shortened production-only page helper scaffolding in emitted page assets:
  - route HTML helpers (`__zrh`, `__zah`)
  - runtime data helpers (`__zss`, `__zrd`, `__zrr`)
  - payload inflate helpers (`__zis`, `__zie`, `__zimk`, `__zim`)
  - mount wrapper (`__zm`, exported as `__zenith_mount`)
- Preserved canonical payload contract variables:
  - `__zenith_expression_bindings`
  - `__zenith_markers`

## Track B — Usage-Gated Emission
Implemented:
- Omit non-router param resolver scaffold for static route patterns (no `:` / `*` segments).
- Emit expression-runtime context prelude bindings only when referenced by each compiled expression:
  - `signalMap`, `params`, `props`, `ssrData`, `data`, `ssr`, `componentBindings`.

## Track C — Revalidation
Contract/runtime:
- `cargo test --manifest-path packages/compiler/Cargo.toml` (pass)
- `cargo test --manifest-path packages/bundler/Cargo.toml` (pass)
- `npm run test --workspace @zenithbuild/runtime` (pass)
- `npm run contract:template --workspace @zenithbuild/router` (pass)

CLI parity:
- `npm run test --workspace @zenithbuild/cli -- tests/resource-streaming.spec.js tests/adapter-hosted-resource-parity.spec.js tests/adapter-platform-node-streaming.spec.js tests/preview.spec.js` (pass)

Publication/determinism:
- `node apps/benchmarks/scripts/run-determinism.mjs --framework zenith --profile publication --run-id phase22-page-scaffold-r2`
  - expected baseline drift after emission changes
- `node apps/benchmarks/scripts/run-determinism.mjs --framework zenith --profile publication --save-baseline --run-id phase22-det-refresh-zenith`
  - baselines refreshed
- `node apps/benchmarks/scripts/run-determinism.mjs --framework zenith --profile publication --run-id phase22-det-post-refresh-zenith` (pass)
- `node apps/benchmarks/scripts/run-matrix.mjs --framework zenith --profile publication --run-id phase22-publication-matrix-zenith` (pass, `29/29`)

Zero-JS static:
- `static-marketing`: `totalJsPlusInlineBytes = 0`, `totalJsSize = 0` (pass)

## Outcome
`interactive-filter` after Phase 22:
- Runtime: `74,949 B` (unchanged)
- Router: `28,502 B` (unchanged)
- Page: `12,395 B` (`-3,338 B`)
- Core: `396 B` (unchanged)
- Total JS+inline: `116,242 B` (`-3,338 B`)

Top page contributors after Phase 22:
- `page-fn:__zv5` `5,321 B` (from `8,246 B`)
- `page-section:__zenith_html` `2,703 B`
- `page-section:__zenith_payload_expression_rows` `1,357 B`
- `page-section:__zenith_payload_marker_rows` `1,320 B`
- `page-section:__zenith_events` `1,158 B`

## Closeout State
- Current optimization lane is paused at late-stage closeout.
- Phase 23 router compaction remains a bounded optional follow-up and is deferred until after release verification.
- Active roadmap focus remains blocked from switching until release/tag/publish verification is green.

# Phase 21 — Structural Decomposition Tracker

Status: `Paused (Wave 3D complete; structural wave paused for release handoff)`

## Scope Locks
- Behavior-preserving extraction only.
- No feature work mixed into decomposition.
- No public API or contract changes.
- Determinism, publication, parity, and zero-JS static gates must remain green.
- Structural wave is paused after Wave 3D pending post-release prioritization.

## Repo Rule (Adopted)
- Preferred max file size: `500` LOC.
- `501–800`: allowed only with strong single-responsibility cohesion.
- `801–1200`: split by default.
- `1201+`: immediate decomposition candidate.
- Exceptions require explicit allowlist entry with rationale.

## Wave Plan
1. Add tracker + allowlist + Stage 1 CI reporting check.
2. Wave 1: decompose `packages/bundler/src/main.rs` into focused modules.
3. Run full stability gates and split-wave artifact comparison.
4. Record before/after line counts and Wave 2 recommendation.

## Wave 1 — Bundler `main.rs`
Target module layout:
- `packages/bundler/src/main.rs` (composition root)
- `packages/bundler/src/bundler_cli.rs`
- `packages/bundler/src/bundler_types.rs`
- `packages/bundler/src/bundler_paths.rs`
- `packages/bundler/src/bundler_contracts.rs`
- `packages/bundler/src/bundler_graph.rs`
- `packages/bundler/src/bundler_css.rs`
- `packages/bundler/src/bundler_minify.rs`
- `packages/bundler/src/bundler_emit_page.rs`
- `packages/bundler/src/bundler_emit_assets.rs`
- `packages/bundler/src/bundler_emit_page_tables.rs`
- `packages/bundler/src/bundler_emit_assets_imports.rs`
- `packages/bundler/src/bundler_emit_assets_helpers.rs`
- `packages/bundler/src/bundler_page_entry.rs`
- `packages/bundler/src/bundler_server_script.rs`
- `packages/bundler/src/bundler_main_tests.rs`
- `packages/bundler/src/bundler_runtime_profile.rs`
- `packages/bundler/src/bundler_html_emit.rs`
- `packages/bundler/src/bundler_hash.rs`
- `packages/bundler/src/bundler_input.rs`
- `packages/bundler/src/image_materialization_markup.rs`
- `packages/bundler/src/utils_tests.rs`

Extraction order:
1. utility/path/hash/minify helpers
2. page payload/table/page-entry emission helpers
3. CSS/import resolution and module rewrite logic
4. asset emission/orchestration helpers
5. reduce `main.rs` to orchestration shell

Stability-first rule:
- Extracted functions preserve inputs/outputs first.
- No semantic redesign during extraction.
- Renames/restructure only after behavior parity is proven.

## Stage 1 CI Enforcement
- Add non-blocking file-size audit reporting in CI.
- Report over-limit files against allowlist policy.
- Do not block CI yet; escalate to blocking after first-wave splits.

## Stage 2 CI Enforcement (Active)
- Keep global audit report-only.
- Block on `packages/bundler/src/**` files exceeding `800` lines.
- Block on touched files exceeding `500` lines using `origin/<default-branch>...HEAD`.
- Keep allowlist exceptions explicit via `docs/maintainability/file-size-allowlist.json`.

## Current Wave 1 Progress
- [x] Added tracker: `docs/phase-21-structural-decomposition-tracker.md`
- [x] Added allowlist: `docs/maintainability/file-size-allowlist.json`
- [x] Added audit script: `scripts/file-size-audit.mjs`
- [x] Added CI reporting step (non-blocking) in `.github/workflows/reusable-ci.yml`
- [x] Created Wave 1 bundler module layout files
- [x] Moved CLI/path/graph/contracts/css/minify and selected emit helpers out of `main.rs`
- [x] Re-ran full mandatory stability gates after additional `main.rs` extraction
- [x] Wave 1B: reduced `main.rs` below 1200 LOC
- [x] Wave 1B: split `bundler_emit_page.rs` and `bundler_emit_assets.rs` under 500 LOC
- [x] Wave 1C: reduced `main.rs` from warning band to below 800 LOC
- [x] Wave 1C: split `image_materialization` marker application into dedicated module
- [x] Wave 1C: moved `utils.rs` test suite into dedicated module to enforce file-size target
- [x] Wave 2A: decomposed `packages/compiler/zenith_compiler/src/compiler.rs` into responsibility-based modules
- [x] Wave 2A: made `compiler.rs` a composition shell with signature-preserving orchestration
- [x] Wave 2A: enabled CI blocking for bundler `>800` and touched files `>500`
- [x] Wave 2B: decomposed `packages/compiler/zenith_compiler/src/parser.rs` into responsibility-based modules
- [x] Wave 2B: kept parser facade/orchestration thin with AST/error behavior preserved
- [x] Wave 2C: decomposed `packages/compiler/zenith_compiler/src/script.rs` into responsibility-based modules
- [x] Wave 2C: kept script extraction/lowering facade behavior unchanged
- [x] Wave 3A: decomposed `packages/cli/src/dev-server.js` (`1255` -> `411`)
- [x] Wave 3B: decomposed `packages/cli/src/preview.js` (`1212` -> `14`)
- [x] Wave 3C: decomposed `packages/cli/src/server-contract.js` (`578` -> `25`)
- [x] Wave 3D: decomposed `packages/cli/src/dev-build-session.js` and supporting modules
- [x] Structural wave paused at approved checkpoint

## Wave 1 Line Count Snapshot
- `packages/bundler/src/main.rs`: `4727` -> `761`
- `packages/bundler/src/image_materialization.rs`: `802` -> `673`
- `packages/bundler/src/utils.rs`: `700` -> `500`
- `packages/bundler/src/bundler_cli.rs`: `112`
- `packages/bundler/src/bundler_types.rs`: `368`
- `packages/bundler/src/bundler_paths.rs`: `161`
- `packages/bundler/src/bundler_contracts.rs`: `451`
- `packages/bundler/src/bundler_graph.rs`: `147`
- `packages/bundler/src/bundler_css.rs`: `325`
- `packages/bundler/src/bundler_minify.rs`: `121`
- `packages/bundler/src/bundler_emit_page.rs`: `240`
- `packages/bundler/src/bundler_emit_page_tables.rs`: `384`
- `packages/bundler/src/bundler_emit_assets.rs`: `231`
- `packages/bundler/src/bundler_emit_assets_imports.rs`: `225`
- `packages/bundler/src/bundler_emit_assets_helpers.rs`: `122`
- `packages/bundler/src/bundler_page_entry.rs`: `355`
- `packages/bundler/src/bundler_server_script.rs`: `228`
- `packages/bundler/src/bundler_main_tests.rs`: `299`
- `packages/bundler/src/bundler_runtime_profile.rs`: `92`
- `packages/bundler/src/bundler_html_emit.rs`: `138`
- `packages/bundler/src/bundler_hash.rs`: `34`
- `packages/bundler/src/bundler_input.rs`: `37`
- `packages/bundler/src/image_materialization_markup.rs`: `134`
- `packages/bundler/src/utils_tests.rs`: `194`

## Wave 2A Line Count Snapshot
- `packages/compiler/zenith_compiler/src/compiler.rs`: `1639` -> `393`
- `packages/compiler/zenith_compiler/src/compiler_types.rs`: `267`
- `packages/compiler/zenith_compiler/src/compiler_profile.rs`: `191`
- `packages/compiler/zenith_compiler/src/compiler_payload_map.rs`: `234`
- `packages/compiler/zenith_compiler/src/compiler_expression_bindings.rs`: `321`
- `packages/compiler/zenith_compiler/src/compiler_diagnostics.rs`: `283`

## Wave 2B Line Count Snapshot
- `packages/compiler/zenith_compiler/src/parser.rs`: `1093` -> `121`
- `packages/compiler/zenith_compiler/src/parser_parse.rs`: `131`
- `packages/compiler/zenith_compiler/src/parser_elements.rs`: `366`
- `packages/compiler/zenith_compiler/src/parser_embedded_markup.rs`: `498`

## Wave 2C Line Count Snapshot
- `packages/compiler/zenith_compiler/src/script.rs`: `840` -> `18`
- `packages/compiler/zenith_compiler/src/script_types.rs`: `149`
- `packages/compiler/zenith_compiler/src/script_extract.rs`: `181`
- `packages/compiler/zenith_compiler/src/script_analyze.rs`: `201`
- `packages/compiler/zenith_compiler/src/script_contract.rs`: `186`
- `packages/compiler/zenith_compiler/src/script_dom_lint.rs`: `138`

## Wave 1 Gate Runs (Current)
- `cargo test --manifest-path packages/bundler/Cargo.toml` ✅
- `npm run test --workspace @zenithbuild/runtime` ✅
- `npm run contract:template --workspace @zenithbuild/router` ✅
- `npm run test --workspace @zenithbuild/cli -- tests/resource-streaming.spec.js tests/adapter-hosted-resource-parity.spec.js tests/adapter-platform-node-streaming.spec.js` ✅
- `node apps/benchmarks/scripts/run-determinism.mjs --framework zenith --profile publication --run-id phase21-wave1c-bundler-det` ✅
- `node apps/benchmarks/scripts/run-matrix.mjs --framework zenith --profile publication --run-id phase21-wave1c-bundler-matrix` ✅

## Wave 2A Gate Runs (Current)
- `cargo test --manifest-path packages/compiler/Cargo.toml` ✅
- `cargo test --manifest-path packages/bundler/Cargo.toml` ✅
- `npm run test --workspace @zenithbuild/runtime` ✅
- `npm run contract:template --workspace @zenithbuild/router` ✅
- `npm run test --workspace @zenithbuild/cli -- tests/resource-streaming.spec.js tests/adapter-hosted-resource-parity.spec.js tests/adapter-platform-node-streaming.spec.js` ✅
- `node apps/benchmarks/scripts/run-determinism.mjs --framework zenith --profile publication --run-id phase21-wave2a-compiler-det` ✅
- `node apps/benchmarks/scripts/run-matrix.mjs --framework zenith --profile publication --run-id phase21-wave2a-compiler-matrix` ✅

## Wave 2B Gate Runs (Current)
- `cargo test --manifest-path packages/compiler/Cargo.toml` ✅
- `cargo test --manifest-path packages/bundler/Cargo.toml` ✅
- `npm run test --workspace @zenithbuild/runtime` ✅
- `npm run contract:template --workspace @zenithbuild/router` ✅
- `npm run test --workspace @zenithbuild/cli -- tests/resource-streaming.spec.js tests/adapter-hosted-resource-parity.spec.js tests/adapter-platform-node-streaming.spec.js` ✅
- `node apps/benchmarks/scripts/run-determinism.mjs --framework zenith --profile publication --run-id phase21-wave2b-parser-det` ✅
- `node apps/benchmarks/scripts/run-matrix.mjs --framework zenith --profile publication --run-id phase21-wave2b-parser-matrix` ✅

## Wave 2C Gate Runs (Current)
- `cargo test --manifest-path packages/compiler/Cargo.toml` ✅
- `cargo test --manifest-path packages/bundler/Cargo.toml` ✅
- `npm run test --workspace @zenithbuild/runtime` ✅
- `npm run contract:template --workspace @zenithbuild/router` ✅
- `npm run test --workspace @zenithbuild/cli -- tests/resource-streaming.spec.js tests/adapter-hosted-resource-parity.spec.js tests/adapter-platform-node-streaming.spec.js` ✅
- `node apps/benchmarks/scripts/run-determinism.mjs --framework zenith --profile publication --run-id phase21-wave2c-script-det` ✅
- `node apps/benchmarks/scripts/run-matrix.mjs --framework zenith --profile publication --run-id phase21-wave2c-script-matrix` ✅

## Wave 1 Artifact/Publication Check
- Determinism run matched publication baselines on all four Zenith fixtures.
- Publication matrix assessment reports `publicationStatus = ready`.
- `static-marketing` bundle-analysis remains zero-JS (`totalJsPlusInlineBytes = 0`, `jsCount = 0`).

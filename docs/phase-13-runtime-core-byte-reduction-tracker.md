# Phase 13 Runtime-Core Byte Reduction Tracker

## 1. Executive Summary

Phase 13 reduces Zenith interactive-route shipped JS by shrinking emitted production runtime bytes first, while preserving determinism, zero-JS static behavior, and hosted/resource/streaming parity.

Scope was kept narrow:
- no new framework feature surface
- no server model or middleware changes
- no hosted `download(...)` expansion
- no benchmark Round 2 scope

## 2. Track Overview

- [x] **Track A: Runtime Contributor Budgeting** (Implemented)
- [x] **Track B: Production Runtime Profile Pruning** (Implemented)
- [x] **Track C: Determinism/Parity Revalidation** (Implemented)
- [x] **Track D: Deterministic Minification Fallback** (Implemented, required)

## 3. Implementation Summary

### Track A — Runtime Contributor Budgeting
Implemented:
- profile-aware runtime template assembly metadata
- deterministic contributor ranking by byte size
- benchmark artifact fields:
  - `runtimeChunkBytes`
  - `runtimeContributors`
  - `runtimeCoverageBytes`

Evidence:
- `interactive-filter` publication bundle-analysis artifact now records contributor ranking and coverage bytes.

### Track B — Production Runtime Profile Pruning
Implemented:
- production emitted runtime profile variants:
  - `production-emitted` (no `presence.js`)
  - `production-emitted-with-presence` (presence retained only when required by detected usage)
- production diagnostics switched to non-overlay runtime path via `diagnostics-production.js`
- full/default runtime profile preserved for package/runtime surface

First-cut result before fallback (`interactive-filter`):
- runtime: `136,447 B` → `121,923 B` (`-14,524 B`)
- below locked pre-fallback target (`-15,000 B`)

### Track C — Mandatory Revalidation
Validated:
- bundler contract/runtime suites (`cargo test --manifest-path packages/bundler/Cargo.toml`)
- runtime package suite (`npm --workspace packages/runtime test`)
- CLI parity suites:
  - `tests/resource-streaming.spec.js`
  - `tests/adapter-hosted-resource-parity.spec.js`
  - `tests/adapter-platform-node-streaming.spec.js`
- publication determinism after baseline refresh:
  - `phase13-det-postrefresh` passed
- Zenith publication-profile matrix:
  - `phase13-pub-zenith` passed all tracks
- zero-JS static:
  - `static-marketing` remains `0` JS files and `0` inline scripts

### Track D — Minification Fallback
Implemented:
- deterministic bundler-native production-only runtime whitespace compaction
- dev-stable output unchanged

Post-fallback result (`interactive-filter`):
- runtime: `112,531 B` (`-23,916 B` vs baseline)
- total interactive-route JS+inline: `180,282 B` (`-23,916 B` vs baseline)

## 4. Locked Gates

### Runtime target gate
- Baseline runtime chunk: `136,447 B`
- Final runtime chunk: `112,531 B`
- Gate: passed (`<= 121,447 B`)

### Safety gates
- Zenith publication determinism: passed
- Zenith publication matrix hard gates: passed
- local/hosted streaming-resource parity suites: passed
- zero-JS static (`static-marketing`): passed

### Policy gate
- External framework determinism remains caveat-only metadata (unchanged).

## 5. Baseline/Artifact Notes

- Zenith publication baselines refreshed during this phase to capture intentional runtime emission changes:
  - `content-index__zenith.json`
  - `interactive-filter__zenith.json`
  - `reactive-minimal__zenith.json`
  - `static-marketing__zenith.json`

- Determinism refresh run:
  - `phase13-det-refresh-zenith`
- Determinism verification run:
  - `phase13-det-postrefresh`
- Zenith publication matrix run:
  - `phase13-pub-zenith`
